'use client';

import React from 'react';

/**
 * Every public route (landing, sign in, sign up) now owns its chrome: the framed hero nav
 * and the landing footer, and renders its own <main> landmark. The dashboard has its own shell.
 */
export function PublicLayoutWrapper({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col">{children}</div>;
}
