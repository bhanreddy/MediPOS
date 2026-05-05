import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import api from '../../lib/api';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ArrowLeft, Save, Image as ImageIcon, UploadCloud } from 'lucide-react';
import toast from 'react-hot-toast';

const profileSchema = z.object({
    name: z.string().min(1, 'Clinic Name is required'),
    owner_name: z.string().min(1, 'Owner Name is required'),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email('Invalid email').optional().or(z.literal('')),
    gstin: z.string().optional(),
    drug_licence_number: z.string().optional(),
    invoice_footer: z.string().optional(),
    logo_url: z.string().optional(),
    signature_url: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export const AdminClinicProfile: React.FC = () => {
    const { id: medical_id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    
    const [logoBase64, setLogoBase64] = useState<string | null>(null);
    const [signatureBase64, setSignatureBase64] = useState<string | null>(null);
    const logoInputRef = useRef<HTMLInputElement>(null);
    const signatureInputRef = useRef<HTMLInputElement>(null);

    const { data: clinicData, isLoading } = useQuery({
        queryKey: ['admin-clinic-profile', medical_id],
        queryFn: async () => {
            const { data } = await api.get(`/admin/clinics/${medical_id}/profile`);
            return data.data;
        },
        enabled: !!medical_id
    });

    const form = useForm<ProfileFormValues>({
        resolver: zodResolver(profileSchema),
        defaultValues: {
            name: '',
            owner_name: '',
            address: '',
            phone: '',
            email: '',
            gstin: '',
            drug_licence_number: '',
            invoice_footer: '',
            logo_url: '',
            signature_url: ''
        }
    });

    useEffect(() => {
        if (clinicData) {
            form.reset({
                name: clinicData.name || '',
                owner_name: clinicData.owner_name || '',
                address: clinicData.address || '',
                phone: clinicData.phone || '',
                email: clinicData.email || '',
                gstin: clinicData.gstin || '',
                drug_licence_number: clinicData.drug_licence_number || '',
                invoice_footer: clinicData.invoice_footer || '',
                logo_url: clinicData.logo_url || '',
                signature_url: clinicData.signature_url || ''
            });
            setLogoBase64(clinicData.logo_url || null);
            setSignatureBase64(clinicData.signature_url || null);
        }
    }, [clinicData, form]);

    const updateProfileMutation = useMutation({
        mutationFn: async (values: ProfileFormValues) => {
            const payload = {
                ...values,
                logo_url: logoBase64 || undefined,
                signature_url: signatureBase64 || undefined,
            };
            const { data } = await api.put(`/admin/clinics/${medical_id}/profile`, payload);
            return data;
        },
        onSuccess: () => {
            toast.success('Clinic profile updated successfully');
            queryClient.invalidateQueries({ queryKey: ['admin-clinics'] });
            queryClient.invalidateQueries({ queryKey: ['admin-clinic-profile', medical_id] });
            navigate('/admin/clinics');
        },
        onError: (err: any) => {
            toast.error(err?.response?.data?.error || 'Failed to update profile');
        }
    });

    const handleFileUpload = (file: File | null, type: 'logo' | 'signature') => {
        if (!file) return;

        // 2MB limit
        if (file.size > 2 * 1024 * 1024) {
            toast.error('Image is too large. Max 2MB allowed.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target?.result as string;
            if (type === 'logo') {
                setLogoBase64(base64);
            } else {
                setSignatureBase64(base64);
            }
        };
        reader.readAsDataURL(file);
    };

    if (isLoading) {
        return <div className="p-8 text-center text-muted">Loading profile...</div>;
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto pb-12">
            <div className="flex items-center gap-4">
                <Button variant="ghost" onClick={() => navigate('/admin/clinics')} className="px-2">
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Edit Clinic Profile</h1>
                    <p className="text-muted">Manage locked legal and business identity fields</p>
                </div>
            </div>

            <Card className="p-6">
                <form className="space-y-6" onSubmit={form.handleSubmit((data) => updateProfileMutation.mutate(data))}>
                    
                    {/* Media Uploads */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-border">
                        <div>
                            <label className="block text-sm font-bold text-muted uppercase tracking-wider mb-2">Clinic Logo</label>
                            <div className="flex items-center gap-4">
                                <div className="w-24 h-24 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-bg-primary overflow-hidden">
                                    {logoBase64 ? (
                                        <img src={logoBase64} alt="Logo" className="w-full h-full object-contain" />
                                    ) : (
                                        <ImageIcon className="w-8 h-8 text-muted/50" />
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Button type="button" variant="secondary" size="sm" onClick={() => logoInputRef.current?.click()}>
                                        <UploadCloud className="w-4 h-4 mr-2" />
                                        Upload Logo
                                    </Button>
                                    <input 
                                        type="file" 
                                        accept="image/*" 
                                        className="hidden" 
                                        ref={logoInputRef} 
                                        onChange={(e) => handleFileUpload(e.target.files?.[0] || null, 'logo')} 
                                    />
                                    {logoBase64 && (
                                        <Button type="button" variant="ghost" size="sm" className="text-danger" onClick={() => setLogoBase64(null)}>
                                            Remove Logo
                                        </Button>
                                    )}
                                    <p className="text-[10px] text-muted uppercase">Max 2MB. Transparent PNG recommended.</p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-muted uppercase tracking-wider mb-2">Authorized Signature</label>
                            <div className="flex items-center gap-4">
                                <div className="w-32 h-20 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-bg-primary overflow-hidden">
                                    {signatureBase64 ? (
                                        <img src={signatureBase64} alt="Signature" className="w-full h-full object-contain" />
                                    ) : (
                                        <span className="text-muted/50 text-xs text-center px-2">No signature</span>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <Button type="button" variant="secondary" size="sm" onClick={() => signatureInputRef.current?.click()}>
                                        <UploadCloud className="w-4 h-4 mr-2" />
                                        Upload Signature
                                    </Button>
                                    <input 
                                        type="file" 
                                        accept="image/*" 
                                        className="hidden" 
                                        ref={signatureInputRef} 
                                        onChange={(e) => handleFileUpload(e.target.files?.[0] || null, 'signature')} 
                                    />
                                    {signatureBase64 && (
                                        <Button type="button" variant="ghost" size="sm" className="text-danger" onClick={() => setSignatureBase64(null)}>
                                            Remove
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Text Fields */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Input 
                            label="Clinic Name *"
                            {...form.register('name')}
                            error={form.formState.errors.name?.message}
                        />
                        <Input 
                            label="Owner / Authorized Person Name *"
                            {...form.register('owner_name')}
                            error={form.formState.errors.owner_name?.message}
                        />

                        <Input 
                            label="GSTIN"
                            {...form.register('gstin')}
                            placeholder="e.g. 29AAAAA0000A1Z5"
                        />
                        <Input 
                            label="Drug License Number"
                            {...form.register('drug_licence_number')}
                        />

                        <Input 
                            label="Contact Phone"
                            {...form.register('phone')}
                        />
                        <Input 
                            label="Email Address"
                            type="email"
                            {...form.register('email')}
                            error={form.formState.errors.email?.message}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-muted uppercase tracking-wider">Registered Address</label>
                        <textarea
                            className="w-full bg-bg-primary border border-border rounded-lg p-3 text-sm focus:outline-none focus:border-accent-primary"
                            rows={3}
                            {...form.register('address')}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-muted uppercase tracking-wider">Invoice Footer (T&C)</label>
                        <textarea
                            className="w-full bg-bg-primary border border-border rounded-lg p-3 text-sm focus:outline-none focus:border-accent-primary"
                            rows={2}
                            {...form.register('invoice_footer')}
                            placeholder="Valid prescription required for Schedule H/H1 drugs."
                        />
                    </div>

                    <div className="flex justify-end gap-4 pt-6 border-t border-border">
                        <Button type="button" variant="ghost" onClick={() => navigate('/admin/clinics')} disabled={updateProfileMutation.isPending}>
                            Cancel
                        </Button>
                        <Button type="submit" variant="primary" isLoading={updateProfileMutation.isPending}>
                            <Save className="w-4 h-4 mr-2" />
                            Save Profile Changes
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
};
