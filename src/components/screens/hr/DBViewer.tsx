import React, { useEffect, useState } from 'react';
import { Card } from '../../common/Card';
import { SectionHeader } from '../../common/SectionHeader';

export const DBViewer = () => {
  const [overview, setOverview] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOverview = async () => {
      const token = localStorage.getItem('talentflow_token');
      try {
        const res = await fetch('/api/db/overview', { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
        if (!res.ok) {
          const err = await res.json();
          setOverview({ error: err.error || 'Failed to fetch' });
        } else {
          const data = await res.json();
          setOverview(data);
        }
      } catch (err) {
        setOverview({ error: 'Connection error' });
      } finally {
        setLoading(false);
      }
    };
    fetchOverview();
  }, []);

  if (loading) return <div>Loading DB overview...</div>;
  if (!overview) return <div>No data</div>;
  if (overview.error) return <div className="text-red-500">{overview.error}</div>;

  return (
    <div>
      <SectionHeader title="Database Overview" subtitle="Table counts and samples" />
      <div className="grid grid-cols-1 gap-4">
        {Object.keys(overview).map(table => (
          <Card key={table} className="p-4">
            <h3 className="font-bold text-sm mb-2">{table} — {overview[table].count} rows</h3>
            <div className="overflow-x-auto text-xs">
              <pre className="whitespace-pre-wrap">{JSON.stringify(overview[table].sample, null, 2)}</pre>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
