import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import api from '../../../lib/api';
import { Check } from 'lucide-react';
import type { SubscriptionPlan, ClinicSubscription } from '../../../types';

export default function BillingSettings() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [currentSub, setCurrentSub] = useState<ClinicSubscription | null>(null);
  const [currentPlan, setCurrentPlan] = useState<SubscriptionPlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBillingData();
  }, []);

  const fetchBillingData = async () => {
    try {
      const [plansRes, currentRes] = await Promise.all([
        api.get('/subscriptions/plans'),
        api.get('/subscriptions/current')
      ]);
      setPlans(plansRes.data.data);
      setCurrentSub(currentRes.data.data.subscription);
      setCurrentPlan(currentRes.data.data.plan);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (plan: SubscriptionPlan) => {
    try {
      const { data } = await api.post('/subscriptions/create', {
        plan_name: plan.name,
        billing_cycle: 'monthly'
      });
      
      // Redirect to Razorpay hosted checkout short link
      if (data.data.short_url) {
        window.location.href = data.data.short_url;
      }
    } catch (err) {
      console.error('Subscription failed', err);
      alert('Failed to initiate subscription');
    }
  };

  if (loading) return <div>Loading billing details...</div>;

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Billing & Plans</h2>
        <p className="text-gray-500">Manage your subscription and billing details.</p>
      </div>

      <Card className="border-indigo-100 bg-indigo-50/30">
        <CardHeader>
          <CardTitle>Current Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-lg font-semibold capitalize">{currentSub?.status || 'No Action'} • {currentPlan?.display_name || 'Free Trial'}</p>
              <p className="text-sm text-gray-500">
                {currentSub?.status === 'trial' 
                  ? `Trial expires on ${new Date(currentSub.trial_end!).toLocaleDateString()}` 
                  : (currentSub?.current_period_end ? `Renews on ${new Date(currentSub.current_period_end).toLocaleDateString()}` : '')}
              </p>
            </div>
            {currentSub?.status === 'active' && (
              <Button variant="danger" className="text-red-600 border-red-200 hover:bg-red-50">Cancel Subscription</Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-3 gap-6 mt-8">
        {plans.filter(p => p.name !== 'custom' && p.name !== 'trial').map(plan => (
          <Card key={plan.id} className={`relative overflow-hidden ${currentPlan?.name === plan.name ? 'border-indigo-500 ring-1 ring-indigo-500' : ''}`}>
            {currentPlan?.name === plan.name && (
              <div className="absolute top-0 right-0 bg-indigo-500 text-white text-xs px-2 py-1 rounded-bl">Active</div>
            )}
            <CardHeader className="text-center pb-2">
              <CardTitle className="text-xl">{plan.display_name}</CardTitle>
              <div className="mt-4">
                <span className="text-4xl font-bold">₹{plan.price_monthly}</span>
                <span className="text-gray-500">/mo</span>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 mt-4 mb-6">
                <li className="flex items-center text-sm"><Check className="h-4 w-4 text-green-500 mr-2" /> Up to {plan.limits['max_users']} Users</li>
                <li className="flex items-center text-sm"><Check className="h-4 w-4 text-green-500 mr-2" /> {plan.limits['max_daily_bills'] === 9999 ? 'Unlimited' : plan.limits['max_daily_bills']} Daily Bills</li>
                <li className="flex items-center text-sm"><Check className="h-4 w-4 text-green-500 mr-2" /> WhatsApp Receipts</li>
              </ul>
              
              <Button 
                className="w-full" 
                variant={currentPlan?.name === plan.name ? 'secondary' : 'primary'}
                disabled={currentPlan?.name === plan.name}
                onClick={() => handleSubscribe(plan)}
              >
                {currentPlan?.name === plan.name ? 'Current Plan' : 'Upgrade to ' + plan.display_name}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
