import { contactTeamNotification } from './contact-email.templates';

describe('contact-email.templates', () => {
  it('does not render raw HTML from the inquiry message', () => {
    const built = contactTeamNotification({
      fullName: 'Jane <script>',
      workEmail: 'jane@pharmacy.ca',
      organization: 'HealthPlus',
      topicLabel: 'Product support',
      message: '<img src=x onerror=alert(1)> Please help',
    });

    expect(built.html).not.toContain('<script>');
    expect(built.html).not.toContain('<img src=x');
    expect(built.html).toContain('Jane &lt;script&gt;');
    expect(built.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(built.subject).toContain('Product support');
  });
});
