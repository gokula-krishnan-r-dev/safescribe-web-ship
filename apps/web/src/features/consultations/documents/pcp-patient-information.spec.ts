import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assemblePcpWorkspaceHtml,
  formatPcpLetterDateDisplay,
} from './pcp-patient-information';

describe('PCP patient information helpers', () => {
  it('strips a Date: prefix for display', () => {
    assert.equal(formatPcpLetterDateDisplay('Date: 07-Sept-2026'), '07-Sept-2026');
    assert.equal(formatPcpLetterDateDisplay('07-Sept-2026'), '07-Sept-2026');
    assert.equal(formatPcpLetterDateDisplay(''), '');
  });

  it('places the letter date above PATIENT INFORMATION in assembled HTML', () => {
    const html = assemblePcpWorkspaceHtml({
      title: 'Pharmacist Communication to Primary Care Provider',
      identity: {
        name: 'Jane Scott',
        dateOfBirth: '1990-01-02',
        phn: '12345',
        phnNotAvailable: false,
      },
      headerBlock: 'Date: 07-Sept-2026',
      bodyHtml: '<p data-field="salutation">Dear Primary Care Provider,</p>',
    });
    const dateAt = html.indexOf('headerBlock');
    const patientAt = html.indexOf('patientInformationTitle');
    const bodyAt = html.indexOf('salutation');
    assert.ok(dateAt > -1 && dateAt < patientAt);
    assert.ok(patientAt < bodyAt);
    assert.match(html, /Date: 07-Sept-2026/);
  });
});
