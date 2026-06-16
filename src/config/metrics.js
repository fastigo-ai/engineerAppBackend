import client from "prom-client";

client.collectDefaultMetrics({
  prefix: "fastigo_"
});

// 1. Order Metrics
export const vendorOrdersCreated = new client.Counter({
  name: "vendor_orders_created_total",
  help: "Total vendor orders created"
});

export const vendorOrdersCompleted = new client.Counter({
  name: "vendor_orders_completed_total",
  help: "Total vendor orders completed"
});

export const vendorOrdersCancelled = new client.Counter({
  name: "vendor_orders_cancelled_total",
  help: "Total vendor orders cancelled"
});

export const vendorOrdersFailed = new client.Counter({
  name: "vendor_orders_failed_total",
  help: "Total vendor orders failed"
});

// 2. Matching Metrics
export const engineerMatchingSuccess = new client.Counter({
  name: "engineer_matching_success_total",
  help: "Total successful engineer matches"
});

export const engineerMatchingFailed = new client.Counter({
  name: "engineer_matching_failed_total",
  help: "Total failed engineer matches"
});

export const engineerMatchingDuration = new client.Histogram({
  name: "engineer_matching_duration_seconds",
  help: "Time taken to match engineer",
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

// 3. Engineer Metrics
export const engineersOnline = new client.Gauge({
  name: "engineers_online_total",
  help: "Currently online engineers"
});

export const engineersAvailable = new client.Gauge({
  name: "engineers_available_total",
  help: "Currently available engineers"
});

export const engineerAcceptRate = new client.Gauge({
  name: "engineer_accept_rate",
  help: "Engineer accept rate percentage"
});

// 4. Finance Metrics
export const walletCreditTotal = new client.Counter({
  name: "wallet_credit_total",
  help: "Total amount credited to wallets"
});

export const walletDebitTotal = new client.Counter({
  name: "wallet_debit_total",
  help: "Total amount debited from wallets"
});

export const withdrawalSuccessTotal = new client.Counter({
  name: "withdrawal_success_total",
  help: "Total successful withdrawals"
});

export { client };
