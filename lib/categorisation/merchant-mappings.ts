// lib/categorisation/merchant-mappings.ts
// Source of truth: merchant-mappings.csv (edit that file, keep this in sync)

export interface MerchantMapping {
  keyword: string;
  category: string;
  subcategory: string;
}

export const MERCHANT_MAPPINGS: MerchantMapping[] = [
  // Groceries
  { keyword: 'woolworths',            category: 'Essentials', subcategory: 'Groceries' },
  { keyword: 'countdown',             category: 'Essentials', subcategory: 'Groceries' },
  { keyword: 'new world',             category: 'Essentials', subcategory: 'Groceries' },
  { keyword: 'paknsave',              category: 'Essentials', subcategory: 'Groceries' },
  { keyword: 'four square',           category: 'Essentials', subcategory: 'Groceries' },
  // Housing – Maintenance
  { keyword: 'mitre 10',              category: 'Housing',    subcategory: 'Maintenance' },
  { keyword: 'bunnings',              category: 'Housing',    subcategory: 'Maintenance' },
  { keyword: 'placemakers',           category: 'Housing',    subcategory: 'Maintenance' },
  // Housing – Rates
  { keyword: 'auckland council',      category: 'Housing',    subcategory: 'Rates' },
  { keyword: 'wellington city council', category: 'Housing',  subcategory: 'Rates' },
  { keyword: 'christchurch city council', category: 'Housing', subcategory: 'Rates' },
  // Housing – Insurance (Home)
  { keyword: 'aa insurance',          category: 'Housing',    subcategory: 'Insurance (Home)' },
  { keyword: 'tower insurance',       category: 'Housing',    subcategory: 'Insurance (Home)' },
  { keyword: 'state insurance',       category: 'Housing',    subcategory: 'Insurance (Home)' },
  { keyword: 'ami insurance',         category: 'Housing',    subcategory: 'Insurance (Home)' },
  // Utilities
  { keyword: 'mercury',               category: 'Essentials', subcategory: 'Utilities' },
  { keyword: 'genesis energy',        category: 'Essentials', subcategory: 'Utilities' },
  { keyword: 'contact energy',        category: 'Essentials', subcategory: 'Utilities' },
  { keyword: 'trustpower',            category: 'Essentials', subcategory: 'Utilities' },
  { keyword: 'powershop',             category: 'Essentials', subcategory: 'Utilities' },
  // Internet/Phone
  { keyword: 'spark',                 category: 'Essentials', subcategory: 'Internet/Phone' },
  { keyword: 'vodafone',              category: 'Essentials', subcategory: 'Internet/Phone' },
  { keyword: 'one nz',                category: 'Essentials', subcategory: 'Internet/Phone' },
  { keyword: '2degrees',              category: 'Essentials', subcategory: 'Internet/Phone' },
  { keyword: 'skinny',                category: 'Essentials', subcategory: 'Internet/Phone' },
  // Fuel
  { keyword: 'bp',                    category: 'Transport',  subcategory: 'Fuel' },
  { keyword: 'z energy',              category: 'Transport',  subcategory: 'Fuel' },
  { keyword: 'caltex',                category: 'Transport',  subcategory: 'Fuel' },
  { keyword: 'mobil',                 category: 'Transport',  subcategory: 'Fuel' },
  { keyword: 'gull',                  category: 'Transport',  subcategory: 'Fuel' },
  // Public Transport
  { keyword: 'at hop',                category: 'Transport',  subcategory: 'Public Transport' },
  { keyword: 'auckland transport',    category: 'Transport',  subcategory: 'Public Transport' },
  { keyword: 'snapper',               category: 'Transport',  subcategory: 'Public Transport' },
  { keyword: 'metlink',               category: 'Transport',  subcategory: 'Public Transport' },
  // Parking
  { keyword: 'wilson parking',        category: 'Transport',  subcategory: 'Parking' },
  { keyword: 'care park',             category: 'Transport',  subcategory: 'Parking' },
  // Vehicle Maintenance
  { keyword: 'vtnz',                  category: 'Transport',  subcategory: 'Vehicle Maintenance' },
  { keyword: 'aa auto',               category: 'Transport',  subcategory: 'Vehicle Maintenance' },
  { keyword: 'tonys tyre',            category: 'Transport',  subcategory: 'Vehicle Maintenance' },
  // Takeaway/Coffee
  { keyword: 'mcdonalds',             category: 'Lifestyle',  subcategory: 'Takeaway/Coffee' },
  { keyword: 'kfc',                   category: 'Lifestyle',  subcategory: 'Takeaway/Coffee' },
  { keyword: 'burger king',           category: 'Lifestyle',  subcategory: 'Takeaway/Coffee' },
  { keyword: 'subway',                category: 'Lifestyle',  subcategory: 'Takeaway/Coffee' },
  { keyword: 'dominos',               category: 'Lifestyle',  subcategory: 'Takeaway/Coffee' },
  { keyword: 'starbucks',             category: 'Lifestyle',  subcategory: 'Takeaway/Coffee' },
  { keyword: 'coffee club',           category: 'Lifestyle',  subcategory: 'Takeaway/Coffee' },
  // Entertainment
  { keyword: 'event cinemas',         category: 'Lifestyle',  subcategory: 'Entertainment' },
  { keyword: 'hoyts',                 category: 'Lifestyle',  subcategory: 'Entertainment' },
  { keyword: 'skycity',               category: 'Lifestyle',  subcategory: 'Entertainment' },
  // Subscriptions
  { keyword: 'netflix',               category: 'Lifestyle',  subcategory: 'Subscriptions' },
  { keyword: 'spotify',               category: 'Lifestyle',  subcategory: 'Subscriptions' },
  { keyword: 'disney',                category: 'Lifestyle',  subcategory: 'Subscriptions' },
  { keyword: 'apple',                 category: 'Lifestyle',  subcategory: 'Subscriptions' },
  { keyword: 'google',                category: 'Lifestyle',  subcategory: 'Subscriptions' },
  { keyword: 'amazon',                category: 'Lifestyle',  subcategory: 'Subscriptions' },
  // Pharmacy
  { keyword: 'chemist warehouse',     category: 'Health',     subcategory: 'Pharmacy' },
  { keyword: 'unichem',               category: 'Health',     subcategory: 'Pharmacy' },
  { keyword: 'life pharmacy',         category: 'Health',     subcategory: 'Pharmacy' },
  // Fitness
  { keyword: 'les mills',             category: 'Health',     subcategory: 'Fitness' },
  { keyword: 'cityfitness',           category: 'Health',     subcategory: 'Fitness' },
  { keyword: 'anytime fitness',       category: 'Health',     subcategory: 'Fitness' },
  // Clothing
  { keyword: 'hallensteins',          category: 'Shopping',   subcategory: 'Clothing' },
  { keyword: 'glassons',              category: 'Shopping',   subcategory: 'Clothing' },
  { keyword: 'cotton on',             category: 'Shopping',   subcategory: 'Clothing' },
  { keyword: 'farmers',               category: 'Shopping',   subcategory: 'Clothing' },
  // Electronics
  { keyword: 'noel leeming',          category: 'Shopping',   subcategory: 'Electronics' },
  { keyword: 'jb hi fi',              category: 'Shopping',   subcategory: 'Electronics' },
  { keyword: 'pb tech',               category: 'Shopping',   subcategory: 'Electronics' },
  { keyword: 'harvey norman',         category: 'Shopping',   subcategory: 'Electronics' },
  // Home & Garden
  { keyword: 'briscoes',              category: 'Shopping',   subcategory: 'Home & Garden' },
  // Childcare
  { keyword: 'kindercare',            category: 'Children',   subcategory: 'Childcare' },
  { keyword: 'beststart',             category: 'Children',   subcategory: 'Childcare' },
  // Tax
  { keyword: 'ird',                   category: 'Financial',  subcategory: 'Tax' },
  // Internal Transfer
  { keyword: 'transfer',              category: 'Transfers',  subcategory: 'Internal Transfer' },
  { keyword: 'online transfer',       category: 'Transfers',  subcategory: 'Internal Transfer' },
];

/** Build a grouped merchant hint string for injection into AI prompts. */
export function buildMerchantHints(): string {
  const grouped = new Map<string, string[]>();
  for (const m of MERCHANT_MAPPINGS) {
    const key = `${m.category} › ${m.subcategory}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(m.keyword);
  }
  return [...grouped.entries()]
    .map(([label, keywords]) => `${label}: ${keywords.join(', ')}`)
    .join('\n');
}
