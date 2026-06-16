import * as functions from 'firebase-functions/v1';

// ── Billing Protection ───────────────────────────────────────────────
// Triggered by Pub/Sub budget alert → disables billing to stop all charges
export const stopBillingOnBudgetAlert = functions.pubsub.topic('billing-alerts').onPublish(async (message) => {
  const data = message.json as { costAmount: number; budgetAmount: number };
  if (data.costAmount <= data.budgetAmount) return; // 未超預算，不動作

  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-billing'] });
  const client = await auth.getClient();
  const projectId = process.env.GCLOUD_PROJECT!;

  const billingUrl = `https://cloudbilling.googleapis.com/v1/projects/${projectId}/billingInfo`;
  await client.request({
    url: billingUrl,
    method: 'PUT',
    data: { billingAccountName: '' }, // 空字串 = 停用計費
  });

  console.log(`[BillingProtection] 超過預算 $${data.budgetAmount}，已停用計費。`);
});
