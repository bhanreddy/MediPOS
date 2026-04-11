import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import api from '../../lib/api';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Store, User, CheckCircle2 } from 'lucide-react';

const registerSchema = z.object({
  clinic_name: z.string().min(3, 'Clinic name must be at least 3 characters'),
  slug: z.string().min(3).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, and hyphens only'),
  phone: z.string().min(10, 'Valid phone number required'),
  email: z.string().email('Valid email required'),
  full_name: z.string().min(2, 'Full name required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  gstin: z.string().optional(),
  drug_licence_number: z.string().optional()
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export const RegisterWizard = () => {
    const [step, setStep] = useState(1);
    const navigate = useNavigate();

    const form = useForm<RegisterFormValues>({
        resolver: zodResolver(registerSchema),
        defaultValues: {
            clinic_name: '', slug: '', phone: '', email: '', full_name: '', password: '', gstin: '', drug_licence_number: ''
        }
    });

    const submitMutation = useMutation({
        mutationFn: async (values: RegisterFormValues) => {
            const { data } = await api.post('/auth/register', values);
            return data;
        },
        onSuccess: () => {
            setStep(3); // Go to success step
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.error || 'Registration failed');
        }
    });

    const triggerNext = async () => {
        if (step === 1) {
            const ok = await form.trigger(['clinic_name', 'slug', 'gstin', 'drug_licence_number', 'phone']);
            if (ok) setStep(2);
        } else if (step === 2) {
            const ok = await form.trigger(['full_name', 'email', 'password']);
            if (ok) submitMutation.mutate(form.getValues());
        }
    };

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-xl">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-black text-accent-primary tracking-tight">Medical POS</h1>
                    <p className="text-muted mt-2">Set up your multitenant pharmacy workspace</p>
                </div>

                {/* Progress Bar */}
                <div className="flex items-center justify-center mb-8">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${step >= 1 ? 'border-accent-primary bg-accent-primary/20 text-accent-primary' : 'border-border text-muted'} font-bold`}>
                        <Store className="w-5 h-5" />
                    </div>
                    <div className={`w-16 h-1 ${step >= 2 ? 'bg-accent-primary' : 'bg-border'}`} />
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${step >= 2 ? 'border-accent-primary bg-accent-primary/20 text-accent-primary' : 'border-border text-muted'} font-bold`}>
                        <User className="w-5 h-5" />
                    </div>
                    <div className={`w-16 h-1 ${step >= 3 ? 'bg-success' : 'bg-border'}`} />
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${step >= 3 ? 'border-success bg-success/20 text-success' : 'border-border text-muted'} font-bold`}>
                        <CheckCircle2 className="w-5 h-5" />
                    </div>
                </div>

                <Card className="p-8">
                    {step === 1 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                            <div>
                                <h3 className="text-lg font-bold mb-4">Clinic Information</h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-sm font-medium text-muted block mb-1">Clinic Name *</label>
                                        <input {...form.register('clinic_name')} className="w-full bg-bg-primary border border-border rounded-lg p-3 outline-none focus:border-accent-primary" />
                                        {form.formState.errors.clinic_name && <p className="text-danger text-xs mt-1">{form.formState.errors.clinic_name.message}</p>}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-sm font-medium text-muted block mb-1">Subdomain Slug *</label>
                                            <input {...form.register('slug')} placeholder="my-pharmacy" className="w-full bg-bg-primary border border-border rounded-lg p-3 outline-none focus:border-accent-primary" />
                                            {form.formState.errors.slug && <p className="text-danger text-xs mt-1">{form.formState.errors.slug.message}</p>}
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-muted block mb-1">Business Phone *</label>
                                            <input {...form.register('phone')} className="w-full bg-bg-primary border border-border rounded-lg p-3 outline-none focus:border-accent-primary" />
                                            {form.formState.errors.phone && <p className="text-danger text-xs mt-1">{form.formState.errors.phone.message}</p>}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-sm font-medium text-muted block mb-1">GSTIN (Optional)</label>
                                            <input {...form.register('gstin')} className="w-full bg-bg-primary border border-border rounded-lg p-3 outline-none focus:border-accent-primary" />
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-muted block mb-1">Drug License (Optional)</label>
                                            <input {...form.register('drug_licence_number')} className="w-full bg-bg-primary border border-border rounded-lg p-3 outline-none focus:border-accent-primary" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <Button variant="primary" className="w-full py-4 text-lg" onClick={triggerNext}>Continue</Button>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                            <div>
                                <h3 className="text-lg font-bold mb-4">Owner Profile</h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-sm font-medium text-muted block mb-1">Full Name *</label>
                                        <input {...form.register('full_name')} className="w-full bg-bg-primary border border-border rounded-lg p-3 outline-none focus:border-accent-primary" />
                                        {form.formState.errors.full_name && <p className="text-danger text-xs mt-1">{form.formState.errors.full_name.message}</p>}
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-muted block mb-1">Email Address (Login ID) *</label>
                                        <input type="email" {...form.register('email')} className="w-full bg-bg-primary border border-border rounded-lg p-3 outline-none focus:border-accent-primary" />
                                        {form.formState.errors.email && <p className="text-danger text-xs mt-1">{form.formState.errors.email.message}</p>}
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-muted block mb-1">Super Secret Password *</label>
                                        <input type="password" {...form.register('password')} className="w-full bg-bg-primary border border-border rounded-lg p-3 outline-none focus:border-accent-primary" />
                                        {form.formState.errors.password && <p className="text-danger text-xs mt-1">{form.formState.errors.password.message}</p>}
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <Button variant="ghost" className="flex-1 py-4 text-lg border border-border" onClick={() => setStep(1)} disabled={submitMutation.isPending}>Back</Button>
                                <Button variant="primary" className="flex-[2] py-4 text-lg" onClick={triggerNext} disabled={submitMutation.isPending}>
                                    {submitMutation.isPending ? 'Deploying Tenant...' : 'Launch Workspace'}
                                </Button>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="text-center py-8 space-y-6 animate-in fade-in zoom-in-95">
                            <div className="w-20 h-20 bg-success/20 border border-success rounded-full flex items-center justify-center mx-auto text-success">
                                <CheckCircle2 className="w-10 h-10" />
                            </div>
                            <div>
                                <h3 className="text-2xl font-bold">Workspace Ready!</h3>
                                <p className="text-muted mt-2">Your tenant database has been provisioned. Please check your email to verify your account before logging in.</p>
                            </div>
                            <Button variant="primary" className="w-full py-4 text-lg mt-4" onClick={() => navigate('/login')}>Go to Login Screen</Button>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
};
