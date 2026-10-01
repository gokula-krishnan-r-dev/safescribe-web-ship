'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isOpenWorkspaceStatus } from '@safescript/shared';

/** Bounce completed/cancelled consults back to the module landing (which opens or creates). */
export function useLeaveClosedWorkspace(
  status: string | undefined,
  loaded: boolean,
  backHref: string,
) {
  const router = useRouter();
  const closed = loaded && status != null && !isOpenWorkspaceStatus(status);

  useEffect(() => {
    if (closed) router.replace(backHref);
  }, [closed, backHref, router]);

  return closed;
}
