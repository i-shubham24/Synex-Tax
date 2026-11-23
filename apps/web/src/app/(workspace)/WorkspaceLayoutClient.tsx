'use client';

import { AuthGate } from '../../components/AuthGate';
import { DashboardShell } from '../../components/dashboard/DashboardShell';
import { useAuth } from '../../context/AuthContext';
import { WorkspaceProvider } from '../../workspace/WorkspaceContext';

/** Every authenticated workspace route (/dashboard, /clients, /gst/*, /tds, /audit, /settings) shares this shell. */
function Workspace({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  return (
    <WorkspaceProvider token={token}>
      <DashboardShell>{children}</DashboardShell>
    </WorkspaceProvider>
  );
}

export function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <Workspace>{children}</Workspace>
    </AuthGate>
  );
}
