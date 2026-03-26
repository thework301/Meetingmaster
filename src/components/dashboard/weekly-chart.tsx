'use client';
import { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { createClient } from '@/lib/supabase/client';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface WeeklyChartProps {
  companyId: string;
}

export function WeeklyChart({ companyId }: WeeklyChartProps) {
  const [chartData, setChartData] = useState<{ labels: string[]; hours: number[] }>({
    labels: [],
    hours: [],
  });
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function loadData() {
      const labels: string[] = [];
      const hours: number[] = [];

      for (let i = 6; i >= 0; i--) {
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - i * 7);
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        labels.push(weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }));

        const { data } = await supabase
          .from('meetings')
          .select('duration_seconds')
          .eq('company_id', companyId)
          .eq('status', 'completed')
          .gte('started_at', weekStart.toISOString())
          .lt('started_at', weekEnd.toISOString());

        const totalSeconds = data?.reduce((sum, m) => sum + (m.duration_seconds || 0), 0) || 0;
        hours.push(Math.round((totalSeconds / 3600) * 10) / 10);
      }

      setChartData({ labels, hours });
      setLoading(false);
    }

    loadData();
  }, [companyId]);

  if (loading) {
    return <div className="h-48 flex items-center justify-center text-slate-400 text-sm">Loading chart…</div>;
  }

  const data = {
    labels: chartData.labels,
    datasets: [
      {
        label: 'Meeting Hours',
        data: chartData.hours,
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: { parsed: { y: number } }) => `${ctx.parsed.y}h`,
        },
      },
    },
    scales: {
      x: { grid: { display: false } },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(0,0,0,0.05)' },
        ticks: { callback: (v: unknown) => `${v}h` },
      },
    },
  };

  return (
    <div className="h-48">
      <Bar data={data} options={options as Parameters<typeof Bar>[0]['options']} />
    </div>
  );
}
