'use client';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Shield } from 'lucide-react';

const CONSENT_KEY = 'mm_consent_given';

export function ConsentBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const given = localStorage.getItem(CONSENT_KEY);
    if (!given) setShow(true);
  }, []);

  const accept = () => {
    localStorage.setItem(CONSENT_KEY, 'true');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-slate-900 text-white">
      <div className="max-w-4xl mx-auto flex items-start gap-4">
        <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
          <Shield className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium mb-1">Data Collection Notice</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            Meeting Master collects your name, email, and meeting content (transcripts, recordings) to provide its services.
            Voice recordings are transcribed and immediately deleted from our transcription provider. All data is encrypted at rest
            and stored in the EU. You can export or delete your data at any time in Settings. By continuing, you consent to this processing.
            See our <a href="/privacy" className="underline text-blue-400">Privacy Policy</a> for full details.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" onClick={accept} className="bg-blue-500 hover:bg-blue-600">
            Accept &amp; Continue
          </Button>
          <a href="/privacy">
            <Button size="sm" variant="outline" className="text-white border-white/30 hover:bg-white/10">
              Learn More
            </Button>
          </a>
        </div>
      </div>
    </div>
  );
}
