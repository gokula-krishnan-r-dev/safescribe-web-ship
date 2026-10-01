'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { usePharmacyFaxContacts } from '@/features/fax-contacts/hooks';
import { formatDocumentFaxNumber } from '@safescript/shared';
import {
  loadFaxRecipientDraft,
  saveFaxRecipientDraft,
  type FaxRecipientScope,
} from './fax-recipient-storage';

export type SendFaxFormValues = {
  recipientName: string;
  faxNumber: string;
};

interface Props {
  open: boolean;
  documentName: string;
  /** Pharmacy + user + consultation scope for local recipient memory. */
  storageScope: FaxRecipientScope;
  submitting?: boolean;
  defaultRecipient?: { recipientName?: string | null; faxNumber?: string | null };
  onClose: () => void;
  onSubmit: (values: SendFaxFormValues) => void | Promise<void>;
}

function looksLikeFaxNumber(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

function faxDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function formatFaxOption(value: string): string {
  return formatDocumentFaxNumber(value) ?? value;
}

export function SendFaxDialog({
  open,
  documentName,
  storageScope,
  submitting = false,
  defaultRecipient,
  onClose,
  onSubmit,
}: Props) {
  const contactsQuery = usePharmacyFaxContacts(open);
  const contacts = contactsQuery.data ?? [];

  const [recipientName, setRecipientName] = useState('');
  const [faxNumber, setFaxNumber] = useState('');
  const [touched, setTouched] = useState(false);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTouched(false);
    if (defaultRecipient?.recipientName?.trim() || defaultRecipient?.faxNumber?.trim()) {
      setRecipientName(defaultRecipient.recipientName?.trim() ?? '');
      setFaxNumber(defaultRecipient.faxNumber?.trim() ?? '');
      setRestored(false);
      return;
    }
    const draft = loadFaxRecipientDraft(storageScope);
    if (draft) {
      setRecipientName(draft.recipientName);
      setFaxNumber(draft.faxNumber);
      setRestored(true);
      return;
    }
    setRecipientName('');
    setFaxNumber('');
    setRestored(false);
  }, [open, storageScope.tenantId, storageScope.userId, storageScope.consultationId, defaultRecipient?.recipientName, defaultRecipient?.faxNumber]);

  const selectedContactId = useMemo(() => {
    const digits = faxDigits(faxNumber);
    if (digits.length < 10) return '';
    const match = contacts.find(
      (c) =>
        faxDigits(c.faxNumber) === digits &&
        c.name.trim().toLowerCase() === recipientName.trim().toLowerCase(),
    );
    return match?.id ?? '';
  }, [contacts, faxNumber, recipientName]);

  const nameOk = recipientName.trim().length >= 2;
  const faxOk = looksLikeFaxNumber(faxNumber);
  const canSubmit = nameOk && faxOk && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    const values = {
      recipientName: recipientName.trim(),
      faxNumber: faxNumber.trim(),
    };
    await onSubmit(values);
    saveFaxRecipientDraft(storageScope, values);
    setRestored(true);
  };

  const closeIfIdle = (event?: { stopPropagation?: () => void }) => {
    event?.stopPropagation?.();
    if (!submitting) onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !submitting) onClose();
      }}
    >
      <DialogContent
        data-nested-dialog
        overlayClassName="z-[70]"
        className="z-[70] sm:max-w-md"
        onCloseAutoFocus={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.stopPropagation()}
        onPointerDownOutside={(e) => e.stopPropagation()}
        onInteractOutside={(e) => e.stopPropagation()}
        onFocusOutside={(e) => e.stopPropagation()}
      >
        <form onSubmit={(e) => void handleSubmit(e)}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Printer className="h-4 w-4 text-primary" />
              Send fax
            </DialogTitle>
            <DialogDescription className="text-left text-sm leading-relaxed">
              Fax <span className="font-medium text-foreground">{documentName}</span>{' '}
              directly — no cover page. Choose a saved pharmacy fax contact or enter the
              recipient. Your last entry is remembered on this device for your pharmacy
              account.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            {contacts.length > 0 ? (
              <div className="space-y-1.5">
                <Label htmlFor="fax-saved-contact">Saved fax contacts</Label>
                <Select
                  id="fax-saved-contact"
                  value={selectedContactId}
                  disabled={submitting}
                  placeholder="Select a saved contact"
                  options={contacts.map((c) => ({
                    value: c.id,
                    label: `${c.name} — ${formatFaxOption(c.faxNumber)}`,
                  }))}
                  onChange={(e) => {
                    const next = contacts.find((c) => c.id === e.target.value);
                    if (!next) return;
                    setRecipientName(next.name);
                    setFaxNumber(next.faxNumber);
                    setTouched(false);
                  }}
                  aria-label="Saved fax contacts"
                />
                <p className="text-xs text-muted-foreground">
                  Selecting a contact fills the recipient fields. You can still edit them.
                </p>
              </div>
            ) : null}

            {restored && !selectedContactId ? (
              <p className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                Prefilling your last fax recipient. Edit the fields below if you need to send
                elsewhere.
              </p>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="fax-recipient-name">Recipient name</Label>
              <Input
                id="fax-recipient-name"
                autoComplete="name"
                placeholder="e.g. Dr. Smith / Clinic fax"
                value={recipientName}
                disabled={submitting}
                onChange={(e) => setRecipientName(e.target.value)}
                onBlur={() => setTouched(true)}
              />
              {touched && !nameOk ? (
                <p className="text-xs text-destructive">Enter the recipient name</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fax-number">Fax number</Label>
              <Input
                id="fax-number"
                inputMode="tel"
                autoComplete="tel"
                placeholder="e.g. 416-555 1234"
                value={faxNumber}
                disabled={submitting}
                onChange={(e) => setFaxNumber(e.target.value)}
                onBlur={() => setTouched(true)}
              />
              {touched && !faxOk ? (
                <p className="text-xs text-destructive">
                  Enter a valid fax number (at least 10 digits)
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  North American numbers are sent as +1…
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="mt-6 gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={(e) => closeIfIdle(e)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit} className="gap-1.5">
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Sending…
                </>
              ) : (
                'Send fax'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
