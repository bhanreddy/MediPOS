import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { Input } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '../ui/Table';
import { Search, Power, ShieldAlert, Edit } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export const AdminClinics = () => {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState('');
    const createClinic = useMutation({ mutationFn: async () => api.post('/admin/clinics', { name }), onSuccess: () => { setCreating(false); setName(''); toast.success('Clinic created'); void queryClient.invalidateQueries({ queryKey: ['admin-clinics'] }); }, onError: () => toast.error('Could not create clinic. Please retry.') });

    const { data: { data: clinics } = {}, isLoading, isError, refetch } = useQuery({
        queryKey: ['admin-clinics'],
        queryFn: async () => {
            const { data } = await api.get('/admin/clinics');
            return data;
        }
    });

    const toggleStatusMutation = useMutation({
        mutationFn: async ({ id, is_active }: { id: string, is_active: boolean }) => {
            await api.patch(`/admin/clinics/${id}/status`, { is_active: !is_active });
        },
        onError: () => toast.error('Could not update clinic status. Please retry.'),
        onSuccess: () => {
            toast.success('Clinic status updated');
            queryClient.invalidateQueries({ queryKey: ['admin-clinics'] });
        }
    });

    const filterClinics = clinics?.filter((c: any) => (c.name || '').toLowerCase().includes(search.toLowerCase())) || [];

    const startImpersonating = (clinicId: string, clinicName: string) => {
        // Set impersonate clinic locally. 
        // We could use sessionStorage or the api interceptor to dynamically inject headers
        sessionStorage.setItem('impersonate_clinic_id', clinicId);
        sessionStorage.setItem('impersonate_clinic_name', clinicName);
        
        // Re-attach interceptor token logic if we want to dynamically attach header

        
        toast.success(`Impersonating ${clinicName}. Redirecting to POS Dashboard.`);
        window.location.assign('/dashboard'); // Force a full navigation context swap
    };

    if (isError) return <div role="alert" className="p-6 space-y-4"><h1 className="text-xl font-semibold">Could not load this page</h1><p>Check your connection and try again.</p><button onClick={() => void refetch()}>Retry</button></div>;

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Clinics</h1>
                    <p className="text-muted">Manage tenant workspaces and subscriptions</p>
                </div>
                <Button variant="primary" onClick={() => setCreating(true)}> 
                    + Create Clinic
                </Button>
            </div>

            <Modal isOpen={creating} onClose={() => setCreating(false)} title="Create clinic"><form className="space-y-4" onSubmit={event => { event.preventDefault(); if (name.trim()) createClinic.mutate(); }}><Input label="Clinic name" value={name} onChange={event => setName(event.target.value)} required maxLength={200} /><Button type="submit" isLoading={createClinic.isPending}>Create clinic</Button></form></Modal>
            <Card className="p-4">
                <div className="flex gap-4 mb-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted" />
                        <input
                            type="text"
                            placeholder="Search clinics..."
                            className="w-full bg-bg-primary border border-border rounded-lg pl-10 pr-4 py-2 focus:border-accent-primary outline-none"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto rounded-lg border border-border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableCell className="font-semibold px-4 py-3">Clinic Name</TableCell>
                                <TableCell className="font-semibold px-4 py-3">Slug</TableCell>
                                <TableCell className="font-semibold px-4 py-3">Plan</TableCell>
                                <TableCell className="font-semibold px-4 py-3">Status</TableCell>
                                <TableCell className="font-semibold px-4 py-3">Created</TableCell>
                                <TableCell className="font-semibold px-4 py-3 text-right">Actions</TableCell>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell colSpan={6} className="px-4 py-3 relative">
                                            <div className="h-6 bg-bg-primary rounded animate-pulse" />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : filterClinics.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-muted">No clinics found.</TableCell>
                                </TableRow>
                            ) : filterClinics.map((clinic: any) => (
                                <TableRow key={clinic.id} className="hover:bg-bg-primary">
                                    <TableCell className="px-4 py-3 font-medium text-foreground">{clinic.name}</TableCell>
                                    <TableCell className="px-4 py-3 text-muted">{clinic.slug}</TableCell>
                                    <TableCell className="px-4 py-3 uppercase text-xs font-bold">{clinic.plan}</TableCell>
                                    <TableCell className="px-4 py-3">
                                        <span className={`px-2 py-1 text-xs rounded-full ${clinic.is_active ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'}`}>
                                            {clinic.is_active ? 'Active' : 'Disabled'}
                                        </span>
                                    </TableCell>
                                    <TableCell className="px-4 py-3 text-muted text-sm">{clinic.created_at && !Number.isNaN(Date.parse(clinic.created_at)) ? format(new Date(clinic.created_at), 'MMM dd, yyyy') : '—'}</TableCell>
                                    <TableCell className="px-4 py-3 flex items-center justify-end gap-2">
                                        <Button size="sm" variant="ghost" onClick={() => startImpersonating(clinic.id, clinic.name)}>
                                            <ShieldAlert className="w-4 h-4 mr-2" />
                                            Impersonate
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={() => window.location.href = `/admin/clinics/${clinic.id}/profile`}>
                                            <Edit className="w-4 h-4 mr-2" />
                                            Edit Profile
                                        </Button>
                                        <Button 
                                            size="sm" 
                                            variant={clinic.is_active ? "ghost" : "primary"}
                                            className={clinic.is_active ? "text-danger hover:bg-danger/10" : ""}
                                            onClick={() => toggleStatusMutation.mutate({ id: clinic.id, is_active: clinic.is_active })}
                                        >
                                            <Power className="w-4 h-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </Card>
        </div>
    );
};
