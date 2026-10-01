import { ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { ROLES } from '@safescript/shared';
import { ProfessionalAcknowledgementService } from './professional-acknowledgement.service';

function pharmacist(id = 'user-1') {
  return {
    id,
    email: 'pharm@example.com',
    role: ROLES.PHARMACIST,
    tenantId: 't1',
    permissions: [],
    superAdminScope: null,
  };
}

function pharmacyAdmin(id = 'admin-1') {
  return {
    id,
    email: 'admin@example.com',
    role: ROLES.PHARMACIST_ADMIN,
    tenantId: 't1',
    permissions: [],
    superAdminScope: null,
  };
}

describe('ProfessionalAcknowledgementService session gate', () => {
  const prisma = {
    professionalUseAcknowledgement: {
      create: jest.fn(),
    },
  };
  const redis = {
    exists: jest.fn(),
    del: jest.fn(),
    setNx: jest.fn(),
    set: jest.fn(),
  };
  const audit = { log: jest.fn() };

  let service: ProfessionalAcknowledgementService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProfessionalAcknowledgementService(
      prisma as never,
      redis as never,
      audit as never,
    );
  });

  it('does not treat historical acknowledgements as the current login', async () => {
    redis.exists.mockResolvedValue(false);
    const status = await service.getStatusForUser(pharmacist());
    expect(status.required).toBe(true);
    expect(status.acknowledged).toBe(false);
    expect(prisma.professionalUseAcknowledgement.create).not.toHaveBeenCalled();
  });

  it('treats a Redis session flag as acknowledged for this login only', async () => {
    redis.exists.mockResolvedValue(true);
    const status = await service.getStatusForUser(pharmacist());
    expect(status.required).toBe(false);
    expect(status.acknowledged).toBe(true);
  });

  it('skips the gate for platform admins', async () => {
    const status = await service.getStatusForUser({
      id: 'sa-1',
      role: ROLES.SUPER_ADMIN,
    });
    expect(status.acknowledged).toBe(true);
    expect(status.required).toBe(false);
    expect(redis.exists).not.toHaveBeenCalled();
  });

  it('requires acknowledgement from pharmacy administrators for the current login', async () => {
    redis.exists.mockResolvedValue(false);
    const status = await service.getStatusForUser(pharmacyAdmin());
    expect(status.required).toBe(true);
    expect(status.acknowledged).toBe(false);
    expect(redis.exists).toHaveBeenCalledWith('professional_ack:session:admin-1');
  });

  it('clears the session flag so the next login must acknowledge again', async () => {
    redis.del.mockResolvedValue(undefined);
    await service.clearSessionAcknowledgement('user-1');
    expect(redis.del).toHaveBeenCalledWith('professional_ack:session:user-1');
  });

  it('records an audit row the first time this login is acknowledged', async () => {
    redis.setNx.mockResolvedValue(true);
    prisma.professionalUseAcknowledgement.create.mockResolvedValue({ id: 'ack-1' });
    audit.log.mockResolvedValue(undefined);

    const status = await service.acknowledge(pharmacist());

    expect(status.acknowledged).toBe(true);
    expect(prisma.professionalUseAcknowledgement.create).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'professional_ack_accepted' }),
    );
  });

  it('is idempotent for the same login and does not write a second audit row', async () => {
    redis.setNx.mockResolvedValue(false);
    redis.set.mockResolvedValue(undefined);

    const status = await service.acknowledge(pharmacist());

    expect(status.acknowledged).toBe(true);
    expect(prisma.professionalUseAcknowledgement.create).not.toHaveBeenCalled();
  });

  it('releases the session flag when the audit write fails so the pharmacist can retry', async () => {
    redis.setNx.mockResolvedValue(true);
    prisma.professionalUseAcknowledgement.create.mockRejectedValue(new Error('db down'));
    audit.log.mockResolvedValue(undefined);
    redis.del.mockResolvedValue(undefined);

    await expect(service.acknowledge(pharmacist())).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(redis.del).toHaveBeenCalledWith('professional_ack:session:user-1');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'professional_ack_save_failed' }),
    );
  });

  it('rejects acknowledgement from platform admins', async () => {
    await expect(
      service.acknowledge({
        id: 'sa-1',
        email: 'sa@example.com',
        role: ROLES.SUPER_ADMIN,
        tenantId: null,
        permissions: [],
        superAdminScope: null,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(redis.setNx).not.toHaveBeenCalled();
  });

  it('records acknowledgement from pharmacy administrators', async () => {
    redis.setNx.mockResolvedValue(true);
    prisma.professionalUseAcknowledgement.create.mockResolvedValue({ id: 'ack-admin' });
    audit.log.mockResolvedValue(undefined);

    const status = await service.acknowledge(pharmacyAdmin());

    expect(status.acknowledged).toBe(true);
    expect(prisma.professionalUseAcknowledgement.create).toHaveBeenCalledTimes(1);
  });

  it('fails closed when Redis cannot be read', async () => {
    redis.exists.mockRejectedValue(new Error('redis down'));
    await expect(service.hasCurrentAcknowledgement('user-1')).resolves.toBe(false);
  });
});
