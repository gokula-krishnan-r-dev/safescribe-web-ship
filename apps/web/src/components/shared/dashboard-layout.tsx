'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  Building2,
  Settings,
  Palette,
  FlaskConical,
  ClipboardCheck,
  Library,
  BookMarked,
  UserCheck,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Shield,
  BriefcaseMedical,
  RefreshCw,
  Heart,
  Droplet,
  CigaretteOff,
  FileText,
  FileDown,
  Bot,
  Loader2,
  Mail,
  Network,
  Gauge,
  BadgeCheck,
  SlidersHorizontal,
  Stethoscope,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/features/auth/auth-store';
import { ROLES, SAFETY_ALERT_LABEL, SUPER_ADMIN_ACCESS_PATH, SUPER_ADMIN_SCOPE_LABELS, canAccessClinicalManagement, canAccessPharmacyManagement, canManagePlatformAdmins, resolveSuperAdminScope } from '@safescript/shared';
import { AccountMenu } from '@/components/shared/account-menu';
import { ChangePasswordDialog } from '@/features/auth/change-password-dialog';
import { BrandMark } from '@/components/shared/brand-mark';
import { toast } from '@/lib/notify';
import { toastError } from '@/lib/errors';
import { useActiveConsultations, useCreateConsultation } from '@/features/consultations/hooks';
import { consultationsBasePath, renewBasePath, adaptBasePath } from '@/features/consultations/consultations-base-path';
import { isRenewModuleEnabled } from '@/lib/renew-enabled';
import { isAdaptModuleEnabled } from '@/lib/adapt-enabled';
import { usePrescribeUsage, useRenewUsage, isDailyLimitReached } from '@/features/entitlements/hooks';
import { useAccessRequestSummary } from '@/features/access-requests/hooks';
import {
  CONSULT_SIDEBAR_EVENT,
  flushOpenWorkspace,
  readConsultSidebarOpen,
  setConsultSidebarOpen,
  toggleConsultSidebarOpen,
} from '@/features/consultations/consult-sidebar-state';
import {
  getPortalHome,
  resolvePortalFromPath,
  writeStoredPortal,
  type SuperAdminPortal,
} from '@/features/super-admin-portal/portal';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface PharmacistNavItem {
  label: string;
  href?: string;
  icon: React.ComponentType<{ className?: string }>;
  comingSoon?: boolean;
  section?: 'primary' | 'secondary';
}

/** Pharmacy Management portal — tenants, admins, audit */
const superAdminPharmacyNav: NavItem[] = [
  { label: 'Dashboard', href: '/super-admin', icon: LayoutDashboard },
  { label: 'Access Requests', href: '/super-admin/access-requests', icon: BadgeCheck },
  { label: 'Pharmacy Management', href: '/super-admin/management', icon: Building2 },
  { label: 'Pharmacy Admins', href: '/super-admin/management?section=users', icon: Users },
  { label: 'Platform Admins', href: '/super-admin/platform-admins', icon: Shield },
  { label: 'Network Access', href: '/super-admin/network-access', icon: Network },
  { label: 'Pharmacy usage', href: '/super-admin/usage', icon: Gauge },
  { label: 'Contact inbox', href: '/super-admin/contact-inquiries', icon: Mail },
  { label: 'Activity Log', href: '/super-admin/audit-logs', icon: ClipboardList },
];

/** Clinical Platform portal — pathways, safety, AI, docs, settings */
const superAdminPlatformNav: NavItem[] = [
  { label: 'Dashboard', href: '/super-admin/platform', icon: LayoutDashboard },
  { label: 'Clinical Pathways', href: '/super-admin/pathways', icon: FlaskConical },
  { label: 'Pathway test cases', href: '/super-admin/pathway-qa', icon: ClipboardCheck },
  { label: 'Treatment Library', href: '/super-admin/treatment-library', icon: Library },
  { label: 'Indication Mappings', href: '/super-admin/approved-indications', icon: Stethoscope },
  { label: 'Reference Library', href: '/super-admin/reference-library', icon: BookMarked },
  { label: 'Reviewer Library', href: '/super-admin/reviewer-library', icon: UserCheck },
  { label: SAFETY_ALERT_LABEL, href: '/super-admin/safety-engine', icon: ShieldCheck },
  { label: 'Assist System', href: '/super-admin/ai-system', icon: Bot },
  { label: 'Doc Download Format', href: '/super-admin/doc-download-format', icon: FileDown },
  { label: 'Settings', href: '/super-admin/settings', icon: Settings },
];

const pharmacyAdminTools: NavItem[] = [
  { label: 'Manage Users', href: '/admin/pharmacists', icon: Users },
];

/** Exact nav order/labels from pharmacist sidebar design */
function clinicalNav(
  basePath: string,
  renewPath: string,
  renewEnabled: boolean,
  adaptPath: string,
  adaptEnabled: boolean,
): PharmacistNavItem[] {
  const items: PharmacistNavItem[] = [
    { label: 'Prescribe', href: basePath, icon: BriefcaseMedical, section: 'primary' },
    {
      label: 'Renew',
      href: renewPath,
      icon: RefreshCw,
      section: 'primary',
      comingSoon: !renewEnabled,
    },
  ];
  if (adaptEnabled) {
    items.push({
      label: 'Adapt',
      href: adaptPath,
      icon: SlidersHorizontal,
      section: 'primary',
    });
  }
  items.push(
    { label: 'CACP / SMMA', icon: Heart, comingSoon: true, section: 'primary' },
    { label: 'Diabetes Consult', icon: Droplet, comingSoon: true, section: 'primary' },
    { label: 'Smoking Cessation', icon: CigaretteOff, comingSoon: true, section: 'primary' },
    { label: 'Active Consultations', href: basePath, icon: FileText, section: 'secondary' },
  );
  return items;
}

const COLLAPSE_KEY = 'safescript.sidebar.collapsed';
const SIDEBAR_W = 260;
const SIDEBAR_W_COLLAPSED = 68;

export function DashboardLayout({
  children,
  role,
  shellOnly = false,
}: {
  children: React.ReactNode;
  role: string;
  /** Render the app chrome without live data or interaction (acknowledgement overlay). */
  shellOnly?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [consultRailOpen, setConsultRailOpen] = useState(true);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [renewEnabled, setRenewEnabled] = useState(false);
  const [adaptEnabled, setAdaptEnabled] = useState(false);

  const isPharmacist = role === ROLES.PHARMACIST;
  const isPharmacyAdmin = role === ROLES.PHARMACIST_ADMIN;
  const isClinicalUser = isPharmacist || isPharmacyAdmin;
  const consultBase = consultationsBasePath(role);
  const renewBase = renewBasePath(role);
  const adaptBase = adaptBasePath(role);
  /** Pharmacist and pharmacy-admin clinical shells stay expanded — matches production nav. */
  const allowCollapse = !isClinicalUser;
  const isOnRenewModule = pathname === renewBase || pathname.startsWith(`${renewBase}/`);
  const isOnAdaptModule = pathname === adaptBase || pathname.startsWith(`${adaptBase}/`);
  const { data: activeConsultations } = useActiveConsultations({
    enabled: isClinicalUser && !shellOnly,
    module: isOnAdaptModule ? 'adapt' : isOnRenewModule ? 'renew' : 'prescribe',
  });
  const createConsultation = useCreateConsultation();
  const prescribeUsage = usePrescribeUsage({ enabled: isClinicalUser && !shellOnly });
  const renewUsage = useRenewUsage({ enabled: isClinicalUser && !shellOnly && renewEnabled });
  const { data: accessRequestSummary } = useAccessRequestSummary(
    role === ROLES.SUPER_ADMIN && !shellOnly,
  );
  const latestConsultationId = activeConsultations?.consultations?.[0]?.id;
  const atPrescribeLimit =
    prescribeUsage.data?.current?.remaining === 0 &&
    prescribeUsage.data?.current?.unlimited !== true;
  const atRenewLimit =
    renewUsage.data?.current?.remaining === 0 &&
    renewUsage.data?.current?.unlimited !== true;

  useEffect(() => {
    setRenewEnabled(isRenewModuleEnabled());
    setAdaptEnabled(isAdaptModuleEnabled());
  }, []);

  useEffect(() => {
    if (!allowCollapse) {
      setCollapsed(false);
      return;
    }
    if (localStorage.getItem(COLLAPSE_KEY) === 'true') setCollapsed(true);
  }, [allowCollapse]);

  useEffect(() => {
    if (!isClinicalUser) return;
    setConsultRailOpen(readConsultSidebarOpen());
    const onRailChange = (e: Event) => {
      const detail = (e as CustomEvent<{ open: boolean }>).detail;
      if (typeof detail?.open === 'boolean') {
        setConsultRailOpen(detail.open);
      } else {
        setConsultRailOpen(readConsultSidebarOpen());
      }
    };
    window.addEventListener(CONSULT_SIDEBAR_EVENT, onRailChange);
    return () => window.removeEventListener(CONSULT_SIDEBAR_EVENT, onRailChange);
  }, [isClinicalUser]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const toggleCollapsed = () => {
    if (!allowCollapse) return;
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, String(next));
      return next;
    });
  };

  const isSuperAdmin = role === ROLES.SUPER_ADMIN;
  const superAdminScope = resolveSuperAdminScope(user?.role, user?.superAdminScope);
  const superAdminPortal: SuperAdminPortal = isSuperAdmin
    ? resolvePortalFromPath(pathname)
    : 'pharmacy';
  const canSwitchPortal =
    isSuperAdmin &&
    canAccessPharmacyManagement(superAdminScope) &&
    canAccessClinicalManagement(superAdminScope);

  const pharmacyNavItems = canManagePlatformAdmins(superAdminScope)
    ? superAdminPharmacyNav
    : superAdminPharmacyNav.filter((item) => item.href !== '/super-admin/platform-admins');

  const adminNavItems =
    isSuperAdmin
      ? superAdminPortal === 'platform'
        ? superAdminPlatformNav
        : pharmacyNavItems
      : [];

  const handleLogout = async () => {
    await logout();
    router.push(isSuperAdmin ? SUPER_ADMIN_ACCESS_PATH : '/login');
  };

  const switchPortal = (portal: SuperAdminPortal) => {
    writeStoredPortal(portal);
    router.push(getPortalHome(portal));
  };

  const fullName = user ? `${user.firstName} ${user.lastName}` : '';

  const roleLabel = isSuperAdmin
    ? SUPER_ADMIN_SCOPE_LABELS[superAdminScope ?? 'FULL']
    : role === ROLES.PHARMACIST_ADMIN
      ? 'Pharmacy Admin'
      : 'Pharmacist';

  const settingsHref = isSuperAdmin
    ? '/super-admin/settings'
    : isPharmacist
      ? '/pharmacist/settings'
      : '/admin/settings';

  const isManagementShell =
    isSuperAdmin && pathname.startsWith('/super-admin/management');
  const isNetworkAccessShell =
    isSuperAdmin && pathname.startsWith('/super-admin/network-access');
  const isAccessRequestsShell =
    isSuperAdmin && pathname.startsWith('/super-admin/access-requests');
  const isUsageShell = isSuperAdmin && pathname.startsWith('/super-admin/usage');

  const isConsultationWorkspace =
    /\/consultations\/[^/]+$/.test(pathname) ||
    /\/renew\/[^/]+$/.test(pathname) ||
    /\/adapt\/[^/]+$/.test(pathname);
  const isFullBleedShell =
    isManagementShell ||
    isNetworkAccessShell ||
    isAccessRequestsShell ||
    isUsageShell ||
    isConsultationWorkspace;

  const isAdminActive = (href: string) => {
    const pathOnly = href.split('?')[0] ?? href;
    if (
      pathOnly === '/super-admin' ||
      pathOnly === '/super-admin/platform' ||
      pathOnly === '/admin'
    ) {
      return pathname === pathOnly;
    }
    return pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
  };
  const isPrescribeActive =
    pathname === consultBase || pathname.startsWith(`${consultBase}/`);
  const isRenewActive = pathname === renewBase || pathname.startsWith(`${renewBase}/`);
  const prescribeHref = latestConsultationId
    ? `${consultBase}/${latestConsultationId}`
    : consultBase;

  /** Prescribe starts a new consultation and closes the Active Consultations rail. */
  const handlePrescribeClick = async () => {
    flushOpenWorkspace();
    setConsultSidebarOpen(false);
    if (createConsultation.isPending) return;
    if (atPrescribeLimit) {
      toast.message("Today's included assessments have been used", {
        description: 'Existing consultations remain available.',
      });
      return;
    }
    try {
      const created = await createConsultation.mutateAsync();
      toast.success('Consultation started');
      setMobileOpen(false);
      router.push(`${consultBase}/${created.id}`);
    } catch (err) {
      if (isDailyLimitReached(err)) {
        toast.message("Today's included assessments have been used", {
          description: 'Existing consultations remain available.',
        });
        void prescribeUsage.refetch();
        return;
      }
      toastError(err, 'Could not start consultation');
    }
  };

  const handleRenewClick = async () => {
    flushOpenWorkspace();
    setConsultSidebarOpen(false);
    if (createConsultation.isPending) return;
    if (atRenewLimit) {
      toast.message("Today's included renewals have been used", {
        description: 'Existing consultations remain available.',
      });
      return;
    }
    try {
      const created = await createConsultation.mutateAsync({ module: 'renew' });
      toast.success('Renewal started');
      setMobileOpen(false);
      router.push(`${renewBase}/${created.id}`);
    } catch (err) {
      if (isDailyLimitReached(err)) {
        toast.message("Today's included renewals have been used", {
          description: 'Existing consultations remain available.',
        });
        void renewUsage.refetch();
        return;
      }
      toastError(err, 'Could not start renewal');
    }
  };

  /** Active Consultations toggles the work-queue rail. Opening it from outside a workspace lands on that module. */
  const handleConsultationHistoryClick = (e: MouseEvent) => {
    e.preventDefault();
    const nextOpen = toggleConsultSidebarOpen();
    if (!nextOpen) return;
    // The open workspace already hosts the rail. Navigating to Prescribe from Renew
    // unmounts in-progress work and makes the renewal look like it disappeared.
    if (isConsultationWorkspace) return;
    router.push(isRenewActive ? renewBase : prescribeHref);
  };

  const clinicalItems = clinicalNav(consultBase, renewBase, renewEnabled, adaptBase, adaptEnabled);
  const primaryItems = clinicalItems.filter((i) => i.section === 'primary');
  const secondaryItems = clinicalItems.filter((i) => i.section === 'secondary');

  const iconCls = 'h-[18px] w-[18px] shrink-0 stroke-[1.75]';

  const renderPharmacistItem = (item: PharmacistNavItem) => {
    if (item.comingSoon) {
      return (
        <div
          key={item.label}
          title={collapsed ? `${item.label} — Coming soon` : undefined}
          className={cn(
            'flex h-10 cursor-default select-none items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground',
            collapsed && 'md:h-10 md:justify-center md:px-0',
          )}
        >
          <item.icon className={cn(iconCls, 'opacity-55')} />
          <span className={cn('min-w-0 flex-1 truncate', collapsed && 'md:hidden')}>
            {item.label}
          </span>
          <span
            className={cn(
              'ml-auto shrink-0 rounded-full bg-muted px-2 py-[3px] text-[10px] font-medium leading-none text-muted-foreground',
              collapsed && 'md:hidden',
            )}
          >
            Coming soon
          </span>
        </div>
      );
    }

    if (item.label === 'Prescribe') {
      const active = isPrescribeActive;
      const starting = createConsultation.isPending;

      return (
        <button
          key={item.label}
          type="button"
          onClick={() => void handlePrescribeClick()}
          disabled={starting || atPrescribeLimit}
          title={
            atPrescribeLimit
              ? "Today's included assessments have been used"
              : 'Start a new consultation'
          }
          aria-label="Start a new consultation"
          className={cn(
            'group flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
            active
              ? 'bg-sidebar-active text-primary'
              : 'text-foreground/90 hover:bg-muted/60',
            (starting || atPrescribeLimit) && 'cursor-not-allowed opacity-70',
            collapsed && 'md:justify-center md:px-0',
          )}
        >
          {starting ? (
            <Loader2 className={cn(iconCls, 'animate-spin text-primary')} />
          ) : (
            <item.icon
              className={cn(
                iconCls,
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            />
          )}
          <span className={cn('min-w-0 flex-1 truncate text-left', collapsed && 'md:hidden')}>
            {item.label}
          </span>
        </button>
      );
    }

    if (item.label === 'Renew') {
      const starting = createConsultation.isPending;
      return (
        <button
          key={item.label}
          type="button"
          onClick={() => void handleRenewClick()}
          disabled={starting || atRenewLimit}
          title={
            atRenewLimit
              ? "Today's included renewals have been used"
              : 'Start a new renewal'
          }
          aria-label="Start a new renewal"
          className={cn(
            'group flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
            isRenewActive
              ? 'bg-sidebar-active text-primary'
              : 'text-foreground/90 hover:bg-muted/60',
            (starting || atRenewLimit) && 'cursor-not-allowed opacity-70',
            collapsed && 'md:justify-center md:px-0',
          )}
        >
          {starting && isRenewActive ? (
            <Loader2 className={cn(iconCls, 'animate-spin text-primary')} />
          ) : (
            <item.icon
              className={cn(
                iconCls,
                isRenewActive ? 'text-primary' : 'text-muted-foreground',
              )}
            />
          )}
          <span className={cn('min-w-0 flex-1 truncate text-left', collapsed && 'md:hidden')}>
            {item.label}
          </span>
        </button>
      );
    }

    if (item.label === 'Active Consultations') {
      const active = isConsultationWorkspace && consultRailOpen;
      return (
        <button
          key={item.label}
          type="button"
          onClick={handleConsultationHistoryClick}
          title={
            collapsed
              ? item.label
              : consultRailOpen
                ? 'Hide active consultations'
                : 'Show active consultations'
          }
          aria-pressed={consultRailOpen}
          className={cn(
            'flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
            active
              ? 'bg-sidebar-active text-primary'
              : 'text-foreground/90 hover:bg-muted/60',
            collapsed && 'md:justify-center md:px-0',
          )}
        >
          <item.icon
            className={cn(
              iconCls,
              active ? 'text-primary' : 'text-muted-foreground',
            )}
          />
          <span className={cn('truncate', collapsed && 'md:hidden')}>{item.label}</span>
          {!collapsed && (activeConsultations?.count ?? 0) > 0 ? (
            <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#0F6F6B] px-1.5 text-[10px] font-semibold text-white">
              {(activeConsultations?.count ?? 0) > 99
                ? '99+'
                : activeConsultations?.count}
            </span>
          ) : null}
        </button>
      );
    }

    const active = Boolean(
      item.href && (pathname === item.href || pathname.startsWith(`${item.href}/`)),
    );

    return (
      <Link
        key={item.label}
        href={item.href!}
        title={collapsed ? item.label : undefined}
        className={cn(
          'flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
          active
            ? 'bg-sidebar-active text-primary'
            : 'text-foreground/90 hover:bg-muted/60',
          collapsed && 'md:justify-center md:px-0',
        )}
      >
        <item.icon
          className={cn(
            iconCls,
            active ? 'text-primary' : 'text-muted-foreground',
          )}
        />
        <span className={cn('truncate', collapsed && 'md:hidden')}>{item.label}</span>
      </Link>
    );
  };

  const renderAdminTool = (item: NavItem) => {
    const active = isAdminActive(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={cn(
          'flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
          active
            ? 'bg-sidebar-active text-primary'
            : 'text-foreground/90 hover:bg-muted/60',
          collapsed && 'md:justify-center md:px-0',
        )}
      >
        <item.icon
          className={cn(iconCls, active ? 'text-primary' : 'text-muted-foreground')}
        />
        <span className={cn('truncate', collapsed && 'md:hidden')}>{item.label}</span>
      </Link>
    );
  };

  const sectionLabel = (label: string) => (
    <p
      className={cn(
        'mb-1.5 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80',
        collapsed && 'md:hidden',
      )}
    >
      {label}
    </p>
  );

  return (
    <div
      className={cn(
        'flex h-dvh max-h-dvh overflow-hidden bg-background',
        shellOnly && 'pointer-events-none select-none',
      )}
      inert={shellOnly || undefined}
      aria-hidden={shellOnly || undefined}
    >
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <aside
        style={
          {
            ['--sb-w' as string]: `${SIDEBAR_W}px`,
            ['--sb-cw' as string]: `${SIDEBAR_W_COLLAPSED}px`,
          } as React.CSSProperties
        }
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex h-dvh max-h-dvh flex-col border-r border-border bg-sidebar',
          'transition-[width,transform] duration-200 ease-out',
          'md:static md:z-auto md:h-full md:max-h-full md:shrink-0 md:translate-x-0',
          mobileOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full',
          'w-[var(--sb-w)]',
          collapsed ? 'md:w-[var(--sb-cw)]' : 'md:w-[var(--sb-w)]',
        )}
      >
        {/* ── Header (matches image: logo + title + collapse) ── */}
        <div
          className={cn(
            'flex h-[60px] shrink-0 items-center gap-3 px-4',
            collapsed && 'md:justify-center md:px-2',
          )}
        >
          <BrandMark size="md" priority className="rounded-[10px]" />
          <div className={cn('min-w-0 flex-1', collapsed && 'md:hidden')}>
            <p className="truncate text-[15px] font-bold leading-none tracking-tight text-foreground">
              SafeScribe
            </p>
            <p className="mt-1 truncate text-[12px] leading-none text-muted-foreground">
              {roleLabel}
            </p>
          </div>

          <button
            type="button"
            onClick={toggleCollapsed}
            className={cn(
              'hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground',
              'transition-colors hover:bg-muted hover:text-foreground md:flex',
              (!allowCollapse || collapsed) && 'md:hidden',
            )}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <PanelLeftClose className="h-[18px] w-[18px] stroke-[1.75]" />
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted md:hidden"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {allowCollapse && collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            className="mx-auto mb-1 hidden h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:flex"
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <PanelLeftOpen className="h-[18px] w-[18px] stroke-[1.75]" />
          </button>
        )}

        {/* ── Nav: items from top; empty space below (exact image layout) ── */}
        <nav
          className={cn(
            'flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain',
            collapsed ? 'px-2 pt-1' : 'px-3 pt-1',
          )}
          aria-label="Main"
        >
          {isClinicalUser ? (
            <div className="flex flex-col">
              {isPharmacyAdmin ? sectionLabel('Clinical') : null}
              <div className="flex flex-col gap-0.5">
                {primaryItems.map(renderPharmacistItem)}
              </div>
              <div className="mt-3 flex flex-col gap-0.5">
                {secondaryItems.map(renderPharmacistItem)}
              </div>
              {isPharmacyAdmin ? (
                <div className="mt-4 border-t border-border/70 pt-3">
                  {sectionLabel('Pharmacy')}
                  <div className="flex flex-col gap-0.5">
                    {pharmacyAdminTools.map(renderAdminTool)}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <p
                className={cn(
                  'mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80',
                  collapsed && 'md:hidden',
                )}
              >
                {isSuperAdmin
                  ? superAdminPortal === 'platform'
                    ? 'Clinical'
                    : 'Pharmacy'
                  : 'Menu'}
              </p>
              <div className="space-y-1">
                {adminNavItems.map((item) => {
                  const active = isAdminActive(item.href);
                  const pendingCount =
                    item.href === '/super-admin/access-requests'
                      ? accessRequestSummary?.navBadge ?? 0
                      : 0;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                        active
                          ? 'bg-sidebar-active text-accent-foreground shadow-sm'
                          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                        collapsed && 'md:justify-center md:px-0',
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                      )}
                      <span
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                          active
                            ? 'bg-foreground/10 text-accent-foreground'
                            : 'bg-muted/50 text-muted-foreground group-hover:bg-muted group-hover:text-foreground',
                        )}
                      >
                        <item.icon className="h-4 w-4" />
                      </span>
                      <span className={cn('truncate', collapsed && 'md:hidden')}>{item.label}</span>
                      {pendingCount > 0 ? (
                        <span
                          className={cn(
                            'ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground',
                            collapsed && 'md:hidden',
                          )}
                        >
                          {pendingCount > 99 ? '99+' : pendingCount}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </nav>

        {/* ── Footer pinned to bottom (matches image) ── */}
        <div className="mt-auto shrink-0 border-t border-border">
          {/* Expanded footer */}
          <div className={cn('space-y-3 p-4', collapsed && 'md:hidden')}>
            {canSwitchPortal ? (
              <button
                type="button"
                onClick={() =>
                  switchPortal(superAdminPortal === 'platform' ? 'pharmacy' : 'platform')
                }
                className="flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
              >
                {superAdminPortal === 'platform' ? (
                  <Building2 className="h-4 w-4 text-primary" />
                ) : (
                  <FlaskConical className="h-4 w-4 text-primary" />
                )}
                <span className="min-w-0 flex-1 truncate">
                  Switch to{' '}
                  {superAdminPortal === 'platform'
                    ? 'Pharmacy Management'
                    : 'Clinical Platform'}
                </span>
              </button>
            ) : null}

            {isSuperAdmin && superAdminPortal === 'platform' ? (
              <Link
                href={settingsHref}
                className="flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
              >
                <Palette className="h-4 w-4 text-primary" />
                Colour theme
              </Link>
            ) : null}

            <AccountMenu
              name={fullName}
              email={user?.email}
              roleLabel={roleLabel}
              settingsHref={settingsHref}
              onChangePassword={user?.phixLinked ? undefined : () => setPasswordOpen(true)}
              onLogout={() => void handleLogout()}
            />
          </div>

          <div
            className={cn(
              'hidden flex-col items-center gap-2 px-2 py-3',
              collapsed && 'md:flex',
            )}
          >
            {canSwitchPortal ? (
              <button
                type="button"
                onClick={() =>
                  switchPortal(superAdminPortal === 'platform' ? 'pharmacy' : 'platform')
                }
                title={
                  superAdminPortal === 'platform'
                    ? 'Switch to Pharmacy Management'
                    : 'Switch to Clinical Platform'
                }
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-primary hover:bg-muted"
              >
                {superAdminPortal === 'platform' ? (
                  <Building2 className="h-3.5 w-3.5" />
                ) : (
                  <FlaskConical className="h-3.5 w-3.5" />
                )}
              </button>
            ) : null}
            <AccountMenu
              name={fullName}
              email={user?.email}
              roleLabel={roleLabel}
              settingsHref={settingsHref}
              collapsed
              onChangePassword={user?.phixLinked ? undefined : () => setPasswordOpen(true)}
              onLogout={() => void handleLogout()}
            />
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <BrandMark size="sm" />
            <span className="text-sm font-bold tracking-tight">SafeScribe</span>
          </div>
        </header>

        <main
          className={cn(
            'flex min-h-0 flex-1 flex-col overscroll-contain',
            isFullBleedShell ? 'overflow-hidden' : 'overflow-y-auto',
          )}
        >
          {isFullBleedShell ? (
            <div className="flex min-h-0 h-full flex-1 flex-col overflow-hidden">
              {children}
            </div>
          ) : (
            <div className="page-gradient mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
              {children}
            </div>
          )}
        </main>
      </div>

      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </div>
  );
}
