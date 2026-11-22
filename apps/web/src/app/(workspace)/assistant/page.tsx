'use client';

import React, { useEffect, useState } from 'react';
import { Calculator, FilePenLine, MessageSquareText, Newspaper, ScrollText } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { AskPanel } from '../../../components/assistant/AskPanel';
import { NoticePanel } from '../../../components/assistant/NoticePanel';
import { DeedsPanel } from '../../../components/assistant/DeedsPanel';
import { CalculatorsPanel } from '../../../components/assistant/CalculatorsPanel';
import { FeedPanel } from '../../../components/assistant/FeedPanel';

const TABS = [
  { id: 'ask', label: 'Questions', icon: MessageSquareText },
  { id: 'notice', label: 'Notice replies', icon: FilePenLine },
  { id: 'deeds', label: 'Deeds and resolutions', icon: ScrollText },
  { id: 'calc', label: 'Calculators', icon: Calculator },
  { id: 'feed', label: 'Notifications', icon: Newspaper },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** The assistant: questions, notice reply drafts, deed templates, calculators and the notification feed. */
export default function AssistantPage() {
  const { authFetch } = useAuth();
  const [tab, setTab] = useState<TabId>('ask');
  const [modelReady, setModelReady] = useState(false);

  useEffect(() => {
    let live = true;
    authFetch('/api/v1/assistant/status')
      .then(async (r) => (r.ok && live ? setModelReady(Boolean((await r.json()).model)) : null))
      .catch(() => null);
    return () => {
      live = false;
    };
  }, [authFetch]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-pos-ink">Assistant</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-pos-ink/60">
          Draft answers and notice replies from a language model, deed and resolution templates, calculators and official notifications. Everything here is a working or a draft for the CA to check; none of it is advice.
          {!modelReady && ' The language model is not set up, so questions, notice drafts and explanations are off; the rest works.'}
        </p>
      </div>
      <div role="tablist" aria-label="Assistant sections" className="flex flex-wrap items-center gap-2 border-b border-pos-line pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`assistant-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="assistant-panel"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pos-accent ${tab === t.id ? 'bg-pos-accent text-white' : 'bg-pos-muted text-pos-ink/70 hover:bg-pos-line hover:text-pos-ink'}`}
          >
            <t.icon className="h-4 w-4" aria-hidden="true" />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div id="assistant-panel" role="tabpanel" aria-labelledby={`assistant-tab-${tab}`}>
        {tab === 'ask' && <AskPanel modelReady={modelReady} />}
        {tab === 'notice' && <NoticePanel modelReady={modelReady} />}
        {tab === 'deeds' && <DeedsPanel />}
        {tab === 'calc' && <CalculatorsPanel />}
        {tab === 'feed' && <FeedPanel modelReady={modelReady} />}
      </div>
    </div>
  );
}
