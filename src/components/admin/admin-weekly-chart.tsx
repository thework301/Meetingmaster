'use client';
import { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { createClient } from '@/lib/supabase/client';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export function AdminWeeklyChart({ companyId }: { companyId: string }) {
  const [chartData, setChartData] = useState<{ labels: string[]; hours: number[] }>({ labels: [], hours: [] });
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
    }

    loadData();
  }, [companyId]);

  const data = {
    labels: chartData.labels,
    datasets: [{
      label: 'Meeting Hours',
      data: chartData.hours,
      backgroundColor: 'rgba(139, 92, 246, 0.8)',
      borderColor: 'rgba(139, 92, 246, 1)',
      borderWidth: 1,
      borderRadius: 4,
    }],
  };

  return (
    <div className="h-48">
      <Bar data={data} options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
        },
      }} />
    </div>
  );
}
