import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { Card } from '../ui/Card';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '../ui/Table';
import { Search } from 'lucide-react';
import { format } from 'date-fns';

export const AdminUsers = () => {
    const [search, setSearch] = useState('');

    const { data: { data: users } = {}, isLoading } = useQuery({
        queryKey: ['admin-users'],
        queryFn: async () => {
            const { data } = await api.get('/admin/users');
            return data;
        }
    });

    const filterUsers = users?.filter((u: any) => 
        (u.full_name?.toLowerCase() || '').includes(search.toLowerCase()) || 
        (u.email?.toLowerCase() || '').includes(search.toLowerCase())
    ) || [];

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Global Registry</h1>
                    <p className="text-muted">View all platform users across all tenants</p>
                </div>
            </div>

            <Card className="p-4">
                <div className="flex gap-4 mb-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-2.5 h-5 w-5 text-muted" />
                        <input
                            type="text"
                            placeholder="Search names, emails..."
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
                                <TableCell className="font-semibold px-4 py-3">Full Name</TableCell>
                                <TableCell className="font-semibold px-4 py-3">Email</TableCell>
                                <TableCell className="font-semibold px-4 py-3">Clinic</TableCell>
                                <TableCell className="font-semibold px-4 py-3">Role</TableCell>
                                <TableCell className="font-semibold px-4 py-3">Created</TableCell>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell colSpan={5} className="px-4 py-3 relative">
                                            <div className="h-6 bg-bg-primary rounded animate-pulse" />
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : filterUsers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-muted">No users found.</TableCell>
                                </TableRow>
                            ) : filterUsers.map((u: any) => (
                                <TableRow key={u.id} className="hover:bg-bg-primary">
                                    <TableCell className="px-4 py-3 font-medium text-foreground">{u.full_name}</TableCell>
                                    <TableCell className="px-4 py-3 text-muted">{u.email}</TableCell>
                                    <TableCell className="px-4 py-3 text-accent-primary">{u.clinics?.name || 'Super Admin'}</TableCell>
                                    <TableCell className="px-4 py-3"><span className="text-xs uppercase bg-bg-surface px-2 py-1 rounded border border-border text-foreground-strong">{u.role}</span></TableCell>
                                    <TableCell className="px-4 py-3 text-muted text-sm">{format(new Date(u.created_at), 'MMM dd, yyyy')}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </Card>
        </div>
    );
};
