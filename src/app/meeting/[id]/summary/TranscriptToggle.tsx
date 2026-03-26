'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export default function TranscriptToggle({ transcript }: { transcript: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        aria-expanded={open}
      >
        <span>{open ? 'Hide' : 'Show'} full transcript</span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-gray-100">
          <pre className="mt-4 text-xs text-gray-700 leading-relaxed whitespace-pre-wrap font-mono max-h-[32rem] overflow-y-auto rounded-lg bg-gray-50 p-4">
            {transcript}
          </pre>
        </div>
      )}
    </div>
  );
}
