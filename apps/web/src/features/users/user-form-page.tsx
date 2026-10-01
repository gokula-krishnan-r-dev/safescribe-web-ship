'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { toast } from '@/lib/notify';
import { Loader2, ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api-client';
import { getErrorMessage } from '@/lib/errors';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { UserModuleConfig } from './config';
import {
  PharmacyAssignmentFields,
} from './pharmacy-assignment-fields';

const baseSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').optional().or(z.literal('')),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']).optional(),
  organizationName: z.string().optional(),
  organizationFax: z.string().optional(),
  tenantId: z.string().optional(),
  pharmacyAssignmentMode: z.enum(['new', 'existing']).optional(),
});

type FormData = z.infer<typeof baseSchema>;

interface UserFormPageProps {
  config: UserModuleConfig;
  mode: 'create' | 'edit';
  userId?: string;
  defaultValues?: Partial<FormData>;
}

const statusOptionsFor = (type: UserModuleConfig['type']) => [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: type === 'pharmacist' ? 'Inactive' : 'Suspended' },
  { value: 'PENDING', label: 'Pending' },
];

export function UserFormPage({ config, mode, userId, defaultValues }: UserFormPageProps) {
  const router = useRouter();
  const isCreate = mode === 'create';

  const schema = baseSchema.superRefine((data, ctx) => {
    if (isCreate && !data.password) {
      ctx.addIssue({ code: 'custom', message: 'Please set a password', path: ['password'] });
    }

    if (config.showPharmacyAssignment) {
      if (isCreate) {
        if (data.pharmacyAssignmentMode === 'existing' && !data.tenantId) {
          ctx.addIssue({ code: 'custom', message: 'Please choose a pharmacy', path: ['tenantId'] });
        }
        if ((data.pharmacyAssignmentMode ?? 'new') === 'new' && !data.organizationName?.trim()) {
          ctx.addIssue({
            code: 'custom',
            message: 'Please enter the pharmacy name',
            path: ['organizationName'],
          });
        }
        if (
          (data.pharmacyAssignmentMode ?? 'new') === 'new' &&
          data.organizationFax?.trim()
        ) {
          const digits = data.organizationFax.replace(/\D/g, '');
          if (digits.length < 10 || digits.length > 15) {
            ctx.addIssue({
              code: 'custom',
              message: 'Please enter a valid fax number',
              path: ['organizationFax'],
            });
          }
        }
      } else if (!data.tenantId) {
        ctx.addIssue({ code: 'custom', message: 'Please choose a pharmacy', path: ['tenantId'] });
      }
    } else if (config.requireOrganization && isCreate && !data.organizationName?.trim()) {
      ctx.addIssue({ code: 'custom', message: 'Please enter the pharmacy name', path: ['organizationName'] });
    }
  });

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      status: 'ACTIVE',
      pharmacyAssignmentMode: 'new',
      ...defaultValues,
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload: Record<string, unknown> = {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
      };

      if (isCreate) {
        payload.password = data.password;
        if (data.status) payload.status = data.status;

        if (config.showPharmacyAssignment) {
          if (data.pharmacyAssignmentMode === 'existing' && data.tenantId) {
            payload.tenantId = data.tenantId;
          } else if (data.organizationName) {
            payload.organizationName = data.organizationName;
            if (data.organizationFax?.trim()) {
              payload.organizationFax = data.organizationFax.trim();
            }
          }
        } else if (data.organizationName) {
          payload.organizationName = data.organizationName;
        }

        return api.post(config.createEndpoint, payload);
      }

      if (data.status) payload.status = data.status;
      if (config.showPharmacyAssignment && data.tenantId) {
        payload.tenantId = data.tenantId;
      }

      const result = await api.patch(`/users/${userId}`, payload);
      if (data.password) {
        await api.post(`/users/${userId}/reset-password`, { password: data.password });
      }
      return result;
    },
    onSuccess: () => {
      toast.success(isCreate ? 'All done — account created' : 'Changes saved successfully');
      router.push(config.basePath);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div>
      <PageHeader
        title={isCreate ? `Add ${config.singularTitle}` : `Edit ${config.singularTitle}`}
        description={
          isCreate
            ? `Set up a new ${config.singularTitle.toLowerCase()} on the platform`
            : 'Update this person\'s account details'
        }
        breadcrumbs={[
          { label: config.title, href: config.basePath },
          { label: isCreate ? 'Add' : 'Edit' },
        ]}
        actions={
          <Link href={isCreate ? config.basePath : `${config.basePath}/${userId}`}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
          </Link>
        }
      />

      <Card className="max-w-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Account details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>First name</Label>
                <Input {...register('firstName')} />
                {errors.firstName && (
                  <p className="text-xs text-destructive">{errors.firstName.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Last name</Label>
                <Input {...register('lastName')} />
                {errors.lastName && (
                  <p className="text-xs text-destructive">{errors.lastName.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" {...register('email')} disabled={!isCreate} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>{isCreate ? 'Password' : 'New password (leave blank to keep the same)'}</Label>
              <Input type="password" {...register('password')} />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            {config.showPharmacyAssignment ? (
              <PharmacyAssignmentFields
                mode={mode}
                assignmentMode={watch('pharmacyAssignmentMode') ?? 'new'}
                onAssignmentModeChange={(value) => setValue('pharmacyAssignmentMode', value)}
                tenantId={watch('tenantId') ?? ''}
                onTenantIdChange={(value) => setValue('tenantId', value)}
                organizationName={watch('organizationName') ?? ''}
                onOrganizationNameChange={(value) => setValue('organizationName', value)}
                organizationFax={watch('organizationFax') ?? ''}
                onOrganizationFaxChange={(value) => setValue('organizationFax', value)}
                errors={{
                  tenantId: errors.tenantId?.message,
                  organizationName: errors.organizationName?.message,
                  organizationFax: errors.organizationFax?.message,
                }}
              />
            ) : (
              config.requireOrganization &&
              isCreate && (
                <div className="space-y-2">
                  <Label>Pharmacy name</Label>
                  <Input {...register('organizationName')} placeholder="e.g. Maple Street Pharmacy" />
                  {errors.organizationName && (
                    <p className="text-xs text-destructive">{errors.organizationName.message}</p>
                  )}
                </div>
              )
            )}

            {!isCreate && (
              <div className="space-y-2">
                <Label>Status</Label>
                <Controller
                  name="status"
                  control={control}
                  render={({ field }) => (
                    <Select
                      {...field}
                      value={field.value ?? 'ACTIVE'}
                      options={statusOptionsFor(config.type)}
                    />
                  )}
                />
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {isCreate ? 'Create account' : 'Save changes'}
              </Button>
              <Link href={config.basePath}>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
