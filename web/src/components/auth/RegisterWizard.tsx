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
  phone: z.string().regex(/^\d{10}$/, 'Enter a 10-digit phone number'),
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
        onError: (err: unknown) => {
            const detail = (err as {response?: {data?: {error?: string | {message?: string}}}})?.response?.data?.error;
            toast.error(typeof detail === 'string' ? detail : detail?.message || 'Registration failed. Please retry.');
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
        <div className="auth-workspace items-center">
            <div className="w-full max-w-xl">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-black text-accent-primary tracking-tight">Medical POS</h1>
                    <p className="text-muted mt-2">Set up your pharmacy workspace</p>
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

                <Card className="p-8"><form onSubmit={event => { event.preventDefault(); void triggerNext(); }}>
                    {step === 1 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                            <div>
                                <h3 className="text-lg font-bold mb-4">Pharmacy details</h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-sm font-medium text-muted block mb-1" htmlFor="register-clinic_name">Clinic Name *</label>
                                        <input id="register-clinic_name" {...form.register('clinic_name')} className="w-full bg-bg-primary border border-border rounded-lg p-3 outline-none focus:border-accent-primary" />
                                        {form.formState.errors.clinic_name && <p className="text-danger text-xs mt-1">{form.formState.errors.clinic_name.message}</p>}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-sm font-medium text-muted block mb-1" htmlFor="register-slug">Subdomain Slug *</label>
                                        <input id="register-slug" {...form.register('slug')} placeholder="my-pharmacy" className="w-full bg-bg-primary border border-border rounded-lg p-3 outline-none focus:border-accent-primary" />
                                            {form.formState.errors.slug && <p className="text-danger text-xs mt-1">{form.formState.errors.slug.message}</p>}
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-muted block mb-1" htmlFor="register-phone">Business Phone *</label>
                                        <input id="register-phone" {...form.register('phone')} className="w-full bg-bg-primary border border-border rounded-lg p-3 outline-none focus:border-accent-primary" />
                                            {form.formState.errors.phone && <p className="text-danger text-xs mt-1">{form.formState.errors.phone.message}</p>}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-sm font-medium text-muted block mb-1" htmlFor="register-gstin">GSTIN (Optional)</label>
                                        <input id="register-gstin" {...form.register('gstin')} className="w-full bg-bg-primary border border-border rounded-lg p-3 outline-none focus:border-accent-primary" />
                                        </div>
                                        <div>
                                            <label className="text-sm font-medium text-muted block mb-1" htmlFor="register-drug_licence_number">Drug License (Optional)</label>
                                        <input id="register-drug_licence_number" {...form.register('drug_licence_number')} className="w-full bg-bg-primary border border-border rounded-lg p-3 outline-none focus:border-accent-primary" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <Button variant="primary" className="w-full py-4 text-lg" type="submit">Continue</Button>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                            <div>
                                <h3 className="text-lg font-bold mb-4">Your details</h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-sm font-medium text-muted block mb-1" htmlFor="register-full_name">Full Name *</label>
                                        <input id="register-full_name" {...form.register('full_name')} className="w-full bg-bg-primary border border-border rounded-lg p-3 outline-none focus:border-accent-primary" />
                                        {form.formState.errors.full_name && <p className="text-danger text-xs mt-1">{form.formState.errors.full_name.message}</p>}
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-muted block mb-1" htmlFor="register-email">Email Address (Login ID) *</label>
                                        <input type="email" id="register-email" {...form.register('email')} className="w-full bg-bg-primary border border-border rounded-lg p-3 outline-none focus:border-accent-primary" />
                                        {form.formState.errors.email && <p className="text-danger text-xs mt-1">{form.formState.errors.email.message}</p>}
                                    </div>
                                    <div>
                                        <label className="text-sm font-medium text-muted block mb-1" htmlFor="register-password">Password *</label>
                                        <input type="password" id="register-password" {...form.register('password')} className="w-full bg-bg-primary border border-border rounded-lg p-3 outline-none focus:border-accent-primary" />
                                        {form.formState.errors.password && <p className="text-danger text-xs mt-1">{form.formState.errors.password.message}</p>}
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <Button variant="ghost" className="flex-1 py-4 text-lg border border-border" type="button" onClick={() => setStep(1)} disabled={submitMutation.isPending}>Back</Button>
                                <Button variant="primary" className="flex-[2] py-4 text-lg" type="submit" disabled={submitMutation.isPending}>
                                    {submitMutation.isPending ? 'Creating your workspace…' : 'Create workspace'}
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
                                <p className="text-muted mt-2">Your pharmacy workspace is ready. If email confirmation is required, use the link in your inbox before signing in.</p>
                            </div>
                            <Button variant="primary" className="w-full py-4 text-lg mt-4" type="button" onClick={() => navigate('/login')}>Go to Login Screen</Button>
                        </div>
                    )}
                </form></Card>
            </div>
        </div>
    );
};
