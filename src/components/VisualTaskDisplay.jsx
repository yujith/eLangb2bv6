import { ArrowRight } from 'lucide-react';
import { Bar, Line, Pie } from 'react-chartjs-2';

// Normalise AI-returned chartData.type strings to chart.js type keys
function normaliseChartType(raw) {
    if (!raw) return null;
    const s = raw.toLowerCase();
    if (s.includes('line')) return 'line';
    if (s.includes('bar')) return 'bar';
    if (s.includes('pie')) return 'pie';
    if (s.includes('table')) return 'table';
    if (s.includes('process')) return 'process';
    if (s.includes('map')) return 'map';
    return s; // fallback
}

export default function VisualTaskDisplay({ data }) {
    if (!data) return null;
    const { title, taskInstruction, chartData } = data;
    const cd = chartData || {};
    const chartType = normaliseChartType(cd.type);

    const COLORS = [
        'rgba(99,102,241,0.85)', 'rgba(16,185,129,0.85)', 'rgba(245,158,11,0.85)',
        'rgba(239,68,68,0.85)', 'rgba(59,130,246,0.85)', 'rgba(168,85,247,0.85)',
        'rgba(236,72,153,0.85)', 'rgba(20,184,166,0.85)',
    ];

    const isChartType = ['bar', 'line', 'pie'].includes(chartType);

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'top' },
            title: { display: false },
        },
        ...(chartType !== 'pie' ? {
            scales: {
                x: {
                    title: { display: !!cd.xAxisLabel, text: cd.xAxisLabel, font: { size: 11 } },
                    ticks: { font: { size: 11 } },
                },
                y: {
                    title: {
                        display: !!(cd.yAxisLabel || cd.unit),
                        text: [cd.yAxisLabel, cd.unit].filter(Boolean).join(' '),
                        font: { size: 11 },
                    },
                    ticks: { font: { size: 11 } },
                    beginAtZero: true,
                },
            },
        } : {}),
    };

    // Build datasets — support both array of objects and flat data array
    const rawDatasets = cd.datasets && cd.datasets.length > 0
        ? cd.datasets
        : cd.data ? [{ label: title || 'Data', data: cd.data }] : [];

    const datasets = rawDatasets.map((ds, i) => ({
        label: ds.label || `Series ${i + 1}`,
        data: ds.data || [],
        backgroundColor: chartType === 'line' ? COLORS[i % COLORS.length] : (cd.labels || []).map((_, li) => COLORS[li % COLORS.length]),
        borderColor: COLORS[i % COLORS.length].replace('0.85', '1'),
        borderWidth: chartType === 'line' ? 2.5 : 1,
        fill: false,
        tension: 0.3,
        pointRadius: chartType === 'line' ? 4 : 0,
    }));

    const chartDataObj = { labels: cd.labels || [], datasets };

    return (
        <div>
            {/* Title */}
            {title && (
                <div style={{
                    fontWeight: 700, fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)',
                    textAlign: 'center', color: 'var(--color-neutral-800)',
                }}>{title}</div>
            )}

            {/* Unit label */}
            {cd.unit && isChartType && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-neutral-500)', textAlign: 'right', marginBottom: 4 }}>
                    Unit: {cd.unit}
                </div>
            )}

            {/* Bar chart */}
            {chartType === 'bar' && datasets.length > 0 && (
                <div style={{ height: 260 }}>
                    <Bar data={chartDataObj} options={chartOptions} />
                </div>
            )}

            {/* Line chart */}
            {chartType === 'line' && datasets.length > 0 && (
                <div style={{ height: 260 }}>
                    <Line data={chartDataObj} options={chartOptions} />
                </div>
            )}

            {/* Pie chart */}
            {chartType === 'pie' && rawDatasets.length > 0 && (
                <div style={{ height: 240, display: 'flex', justifyContent: 'center' }}>
                    <Pie
                        data={{
                            labels: cd.labels || [],
                            datasets: [{
                                data: rawDatasets[0].data || [],
                                backgroundColor: COLORS,
                                borderColor: '#fff',
                                borderWidth: 2,
                            }],
                        }}
                        options={chartOptions}
                    />
                </div>
            )}

            {/* Table */}
            {chartType === 'table' && cd.tableHeaders && (
                <div style={{ overflowX: 'auto', marginBottom: 'var(--space-2)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
                        <thead>
                            <tr>
                                {cd.tableHeaders.map((h, i) => (
                                    <th key={i} style={{
                                        padding: '7px 12px', background: 'var(--color-primary)',
                                        color: 'white', textAlign: 'left', fontWeight: 600,
                                        borderRight: '1px solid rgba(255,255,255,0.2)',
                                    }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {(cd.tableRows || []).map((row, ri) => (
                                <tr key={ri} style={{ background: ri % 2 === 0 ? 'var(--color-neutral-50)' : 'white' }}>
                                    {row.map((cell, ci) => (
                                        <td key={ci} style={{
                                            padding: '6px 12px',
                                            borderBottom: '1px solid var(--color-neutral-100)',
                                            borderRight: '1px solid var(--color-neutral-100)',
                                        }}>{cell}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Process diagram */}
            {chartType === 'process' && (cd.processSteps || []).length > 0 && (
                <div style={{ marginBottom: 'var(--space-2)' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-2)' }}>
                        {cd.processSteps.map((s, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                <div style={{
                                    padding: '8px 14px', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)',
                                    background: COLORS[i % COLORS.length], color: 'white', fontWeight: 500,
                                    maxWidth: 180, lineHeight: 1.4, textAlign: 'center',
                                }}>{s}</div>
                                {i < cd.processSteps.length - 1 && (
                                    <ArrowRight size={16} color="var(--color-neutral-400)" />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Map comparison */}
            {chartType === 'map' && cd.mapDescription && (
                <div style={{
                    padding: 'var(--space-4)', background: '#F0F9FF', borderRadius: 'var(--radius-md)',
                    border: '1px solid #BAE6FD', fontSize: 'var(--text-xs)', lineHeight: 1.8,
                    marginBottom: 'var(--space-2)',
                }}>
                    <div style={{ fontWeight: 700, marginBottom: 6, color: '#0369A1' }}>Map Reference</div>
                    {cd.mapDescription}
                </div>
            )}

            {/* Task instruction box */}
            <div style={{
                marginTop: 'var(--space-4)', padding: 'var(--space-3) var(--space-4)',
                background: '#FFF7ED', borderRadius: 'var(--radius-md)',
                borderLeft: '4px solid #F59E0B', fontSize: 'var(--text-sm)', lineHeight: 1.8,
                color: 'var(--color-neutral-800)',
            }}>
                {taskInstruction}
            </div>
        </div>
    );
}
