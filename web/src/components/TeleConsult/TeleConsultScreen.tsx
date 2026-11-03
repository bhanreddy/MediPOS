import React, { useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { Table } from '../ui/Table';
import {
    FEATURE_BADGES,
    TELE_CONSULT_COPY,
    TELE_CONSULT_DEFAULTS,
    TELE_CONSULT_SEED,
    type TeleConsultSeedRow,
} from '../../config/appContent';

export const TeleConsultScreen: React.FC = () => {
    const [rows, setRows] = useState<TeleConsultSeedRow[]>(() => [...TELE_CONSULT_SEED]);
    const [doctor, setDoctor] = useState('');
    const [patient, setPatient] = useState('');

    const addMock = () => {
        if (!doctor.trim() || !patient.trim()) return;
        setRows([
            {
                id: crypto.randomUUID(),
                doctor: doctor.trim(),
                patient: patient.trim(),
                time: new Date().toLocaleString(),
                status: TELE_CONSULT_DEFAULTS.newStatus,
                mode: TELE_CONSULT_DEFAULTS.newMode,
            },
            ...rows,
        ]);
        setDoctor('');
        setPatient('');
    };

    const subtitle = useMemo(() => TELE_CONSULT_COPY.subtitle, []);

    return (
        <div className="h-full flex flex-col gap-6 animate-slideIn select-none">
            <div className="flex justify-between items-end flex-wrap gap-4">
                <div>
                    <h2 className="text-billing-total font-black text-foreground-strong tracking-tighter uppercase italic leading-none">
                        {TELE_CONSULT_COPY.title}
                    </h2>
                    <p className="text-muted text-sm font-black uppercase tracking-widest mt-1">{subtitle}</p>
                </div>
                <Badge variant="warning">{FEATURE_BADGES.beta}</Badge>
            </div>

            <div className="bg-surface border-2 border-border rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <Input label={TELE_CONSULT_COPY.labels.doctor} value={doctor} onChange={e => setDoctor(e.target.value)} />
                <Input label={TELE_CONSULT_COPY.labels.patient} value={patient} onChange={e => setPatient(e.target.value)} />
                <Button variant="primary" className="font-black" onClick={addMock}>
                    {TELE_CONSULT_COPY.scheduleButton}
                </Button>
            </div>

            <div className="flex-1 min-h-0 bg-surface border-2 border-border rounded-xl overflow-hidden">
                <Table
                    headers={[...TELE_CONSULT_COPY.tableHeaders]}
                    data={rows}
                    renderRow={r => (
                        <tr key={r.id} className="border-b-2 border-border">
                            <td className="px-4 py-2 font-bold">{r.doctor}</td>
                            <td className="px-4 py-2">{r.patient}</td>
                            <td className="px-4 py-2 text-sm">{r.time}</td>
                            <td className="px-4 py-2">{r.mode}</td>
                            <td className="px-4 py-2">
                                <Badge variant="neutral">{r.status}</Badge>
                            </td>
                        </tr>
                    )}
                />
            </div>
        </div>
    );
};
