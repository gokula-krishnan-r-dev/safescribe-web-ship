import { accessRequestInvite, accessRequestTeamNotification } from './access-request-email.templates';

describe('access-request-email.templates', () => {
  it('does not render raw HTML from registration fields', () => {
    const built = accessRequestTeamNotification({
      pharmacyName: 'Main <script> Pharmacy',
      licenceNumber: '12<img>',
      contactName: 'Jane <b>Smith</b>',
      email: 'jane@pharmacy.ca',
      phone: '7801234567',
      capturedPublicIp: '68.148.208.135',
      sourceLabel: 'Alberta launch',
    });

    expect(built.html).not.toContain('<script>');
    expect(built.html).not.toContain('<img>');
    expect(built.html).not.toContain('<b>Smith</b>');
    expect(built.html).toContain('Main &lt;script&gt; Pharmacy');
    expect(built.subject).toContain('Main <script> Pharmacy');
  });

  it('escapes invite names in HTML', () => {
    const built = accessRequestInvite({
      contactName: 'Jane <b>Smith</b>',
      pharmacyName: 'Main <script> Pharmacy',
      inviteUrl: 'https://safescribe.ca/reset-password?token=abc',
    });
    expect(built.html).not.toContain('<script>');
    expect(built.html).not.toContain('<b>Smith</b>');
    expect(built.html).toContain('Main &lt;script&gt; Pharmacy');
  });
});
