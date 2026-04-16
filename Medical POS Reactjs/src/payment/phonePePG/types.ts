/** Response shape from Express `POST /subscriptions/create` (clinic billing). */
export type ClinicPhonePeCreateResponse = {
  redirect_url?: string;
  merchant_order_id?: string;
  subscription_id?: string;
  phonepe_order_id?: string;
};

/** Response shape from Supabase Edge `create-order` (user subscription). */
export type UserPhonePeCreateResponse = {
  redirect_url: string;
  merchant_order_id: string;
  subscription_id: string;
  phonepe_order_id?: string;
};
