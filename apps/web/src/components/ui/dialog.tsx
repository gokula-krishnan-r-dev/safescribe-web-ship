'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { DialogLayerContext } from '@/components/ui/dialog-layer';
import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

function overlayElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

function nestedOverlaySelector() {
  return [
    '[data-drug-search-dropdown]',
    '[data-device-search-dropdown]',
    '[data-multi-select-dropdown]',
    '[data-searchable-select-dropdown]',
    '[data-dialog-overlay-root]',
    '[data-timing-selector-dropdown]',
    '[data-radix-popper-content-wrapper]',
    '[data-confirm-dialog]',
    '[data-nested-dialog]',
    '[role="tooltip"]',
  ].join(', ');
}

function isNestedOverlayNode(node: EventTarget | null) {
  const el = overlayElement(node);
  return Boolean(el?.closest(nestedOverlaySelector()));
}

function eventPath(target: EventTarget | null, event?: Event): EventTarget[] {
  const original =
    event && 'detail' in event
      ? (event as CustomEvent<{ originalEvent?: Event }>).detail?.originalEvent
      : undefined;
  const source = original ?? event;
  if (source && typeof source.composedPath === 'function') {
    return source.composedPath();
  }
  return target ? [target] : [];
}

function isNestedOverlayTarget(target: EventTarget | null, event?: Event) {
  if (isNestedOverlayNode(target)) return true;
  return eventPath(target, event).some((node) => isNestedOverlayNode(node));
}

/** True when the event hit another dialog (Send fax over document preview). */
function isForeignDialogInteraction(
  target: EventTarget | null,
  event: Event | undefined,
  currentContent: Element | null,
): boolean {
  if (isNestedOverlayTarget(target, event)) return true;
  for (const node of eventPath(target, event)) {
    if (!(node instanceof Element)) continue;
    const otherContent = node.closest('[data-radix-dialog-content]');
    if (otherContent && otherContent !== currentContent) return true;
    const overlay = node.closest('[data-radix-dialog-overlay]');
    if (overlay && currentContent) {
      const portal = overlay.parentElement;
      if (portal && !portal.contains(currentContent)) return true;
    }
  }
  return false;
}

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    overlayClassName?: string;
    hideCloseButton?: boolean;
  }
>(
  (
    {
      className,
      children,
      overlayClassName,
      hideCloseButton,
      onPointerDownOutside,
      onInteractOutside,
      onFocusOutside,
      ...props
    },
    ref,
  ) => {
    const contentRef = React.useRef<HTMLDivElement>(null);
    const [overlayNode, setOverlayNode] = React.useState<HTMLElement | null>(null);
    const setRefs = React.useCallback(
      (node: HTMLDivElement | null) => {
        contentRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      },
      [ref],
    );

    const guardOutside = (e: {
      preventDefault: () => void;
      target: EventTarget | null;
      currentTarget: EventTarget | null;
    }) => {
      const current =
        e.currentTarget instanceof Element ? e.currentTarget : contentRef.current;
      if (isForeignDialogInteraction(e.target, e as unknown as Event, current)) {
        e.preventDefault();
      }
    };

    return (
      <DialogPortal>
        <DialogOverlay className={overlayClassName} />
        <DialogLayerContext.Provider value={overlayNode}>
          <DialogPrimitive.Content
            ref={setRefs}
            className={cn(
              'z-50 grid w-full max-w-lg gap-4 border bg-background p-6 shadow-xl',
              'max-h-[min(100vh-4rem,920px)] overflow-y-auto overscroll-contain',
              'duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              'sm:rounded-2xl',
              className,
              // Positioning last so consumer classes like `relative` cannot un-center the dialog.
              'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
            )}
            onPointerDownOutside={(e) => {
              guardOutside(e);
              onPointerDownOutside?.(e);
            }}
            onInteractOutside={(e) => {
              guardOutside(e);
              onInteractOutside?.(e);
            }}
            onFocusOutside={(e) => {
              guardOutside(e);
              onFocusOutside?.(e);
            }}
            {...props}
          >
            {children}
            {!hideCloseButton ? (
              <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </DialogPrimitive.Close>
            ) : null}
            <div
              ref={setOverlayNode}
              data-dialog-overlay-root=""
              className="pointer-events-none absolute inset-0 z-[100] overflow-visible"
              style={{ gridColumn: '1 / -1', gridRow: '1 / -1' }}
            />
          </DialogPrimitive.Content>
        </DialogLayerContext.Provider>
      </DialogPortal>
    );
  },
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
