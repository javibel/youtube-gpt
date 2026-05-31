'use client';

import { useState } from 'react';

export default function EmbedSeoScore() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [error, setError] = useState('');

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    setScore(null);

    try {
      const res = await fetch('/api/youtube/seo-score-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error === 'invalid_url' ? 'Invalid YouTube URL' : data.error);
      } else if (data.score !== undefined) {
        setScore(data.score);
      }
    } catch {
      setError('Error analyzing video');
    }
    setLoading(false);
  };

  const scoreColor = score !== null
    ? score >= 80 ? '#22c55e' : score >= 60 ? '#eab308' : score >= 40 ? '#f97316' : '#ef4444'
    : '#666';

  return (
    <div style={{ fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', background: '#0a0a0a', color: '#fff', padding: 20, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>YouTube SEO Score</h2>
          <p style={{ fontSize: 13, color: '#71717a', margin: 0 }}>Paste any YouTube video URL</p>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
            placeholder="https://youtube.com/watch?v=..."
            style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #333', background: '#1a1a1a', color: '#fff', fontSize: 14, outline: 'none' }}
          />
          <button
            onClick={handleAnalyze}
            disabled={loading || !url.trim()}
            style={{ padding: '10px 18px', borderRadius: 8, background: '#e84d5b', color: '#fff', fontWeight: 600, fontSize: 14, border: 'none', cursor: 'pointer', opacity: loading ? 0.6 : 1 }}
          >
            {loading ? '...' : 'Check'}
          </button>
        </div>

        {error && <p style={{ color: '#f87171', fontSize: 13, textAlign: 'center' }}>{error}</p>}

        {score !== null && (
          <div style={{ textAlign: 'center', padding: 20, background: '#111', borderRadius: 12, border: '1px solid #222' }}>
            <p style={{ fontSize: 48, fontWeight: 800, color: scoreColor, margin: '0 0 4px' }}>{score}<span style={{ fontSize: 20 }}>/100</span></p>
            <p style={{ fontSize: 13, color: '#71717a', margin: '0 0 12px' }}>
              {score >= 80 ? 'Excellent' : score >= 60 ? 'Good — room to improve' : score >= 40 ? 'Needs improvement' : 'Needs work'}
            </p>
            <a
              href={`https://ytubviral.com/seo-score?url=${encodeURIComponent(url)}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 13, color: '#e84d5b', textDecoration: 'none' }}
            >
              See full analysis on YTubViral →
            </a>
          </div>
        )}

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: '#52525b' }}>
          Powered by <a href="https://ytubviral.com?utm_source=embed&utm_medium=widget" target="_blank" rel="noopener noreferrer" style={{ color: '#e84d5b', textDecoration: 'none' }}>YTubViral.com</a>
        </p>
      </div>
    </div>
  );
}
