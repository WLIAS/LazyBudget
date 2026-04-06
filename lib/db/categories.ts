// lib/db/categories.ts — Category CRUD + default seed

import { v4 as uuidv4 } from 'uuid';
import { getDB, type Category } from './index';

const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
  // Housing
  { group: 'Housing', name: 'Mortgage/Rent',     icon: 'Home',          colour: '#60A5FA', isSystem: true },
  { group: 'Housing', name: 'Rates',              icon: 'Building2',     colour: '#60A5FA', isSystem: true },
  { group: 'Housing', name: 'Insurance (Home)',   icon: 'Shield',        colour: '#60A5FA', isSystem: true },
  { group: 'Housing', name: 'Maintenance',        icon: 'Wrench',        colour: '#60A5FA', isSystem: true },
  // Essentials
  { group: 'Essentials', name: 'Groceries',       icon: 'ShoppingCart',  colour: '#34D399', isSystem: true },
  { group: 'Essentials', name: 'Utilities',        icon: 'Zap',           colour: '#34D399', isSystem: true },
  { group: 'Essentials', name: 'Internet/Phone',  icon: 'Wifi',          colour: '#34D399', isSystem: true },
  { group: 'Essentials', name: 'Insurance (Other)',icon: 'ShieldCheck',   colour: '#34D399', isSystem: true },
  // Transport
  { group: 'Transport', name: 'Fuel',             icon: 'Fuel',          colour: '#FBBF24', isSystem: true },
  { group: 'Transport', name: 'Public Transport', icon: 'Bus',           colour: '#FBBF24', isSystem: true },
  { group: 'Transport', name: 'Parking',          icon: 'ParkingCircle', colour: '#FBBF24', isSystem: true },
  { group: 'Transport', name: 'Vehicle Maintenance', icon: 'Car',        colour: '#FBBF24', isSystem: true },
  // Lifestyle
  { group: 'Lifestyle', name: 'Dining Out',        icon: 'UtensilsCrossed', colour: '#F87171', isSystem: true },
  { group: 'Lifestyle', name: 'Takeaway/Coffee',  icon: 'Coffee',        colour: '#F87171', isSystem: true },
  { group: 'Lifestyle', name: 'Entertainment',    icon: 'Clapperboard',  colour: '#F87171', isSystem: true },
  { group: 'Lifestyle', name: 'Subscriptions',    icon: 'Repeat',        colour: '#F87171', isSystem: true },
  // Health
  { group: 'Health', name: 'Medical',             icon: 'Stethoscope',   colour: '#A78BFA', isSystem: true },
  { group: 'Health', name: 'Pharmacy',            icon: 'Pill',          colour: '#A78BFA', isSystem: true },
  { group: 'Health', name: 'Fitness',             icon: 'Dumbbell',      colour: '#A78BFA', isSystem: true },
  // Shopping
  { group: 'Shopping', name: 'Clothing',          icon: 'Shirt',         colour: '#FB923C', isSystem: true },
  { group: 'Shopping', name: 'Electronics',       icon: 'Laptop',        colour: '#FB923C', isSystem: true },
  { group: 'Shopping', name: 'Home & Garden',     icon: 'Flower2',       colour: '#FB923C', isSystem: true },
  // Children
  { group: 'Children', name: 'Childcare',         icon: 'Baby',          colour: '#EC4899', isSystem: true },
  { group: 'Children', name: 'School',            icon: 'GraduationCap', colour: '#EC4899', isSystem: true },
  { group: 'Children', name: 'Kids Activities',   icon: 'Gamepad2',      colour: '#EC4899', isSystem: true },
  // Financial
  { group: 'Financial', name: 'Fees & Charges',   icon: 'Receipt',       colour: '#9CA3AF', isSystem: true },
  { group: 'Financial', name: 'Interest Paid',    icon: 'TrendingDown',  colour: '#9CA3AF', isSystem: true },
  { group: 'Financial', name: 'Tax',              icon: 'FileText',      colour: '#9CA3AF', isSystem: true },
  // Income
  { group: 'Income', name: 'Salary',              icon: 'Briefcase',     colour: '#34D399', isSystem: true },
  { group: 'Income', name: 'Interest Earned',     icon: 'TrendingUp',    colour: '#34D399', isSystem: true },
  { group: 'Income', name: 'Refunds',             icon: 'RotateCcw',     colour: '#34D399', isSystem: true },
  { group: 'Income', name: 'Other Income',        icon: 'DollarSign',    colour: '#34D399', isSystem: true },
  // Transfers
  { group: 'Transfers', name: 'Internal Transfer', icon: 'ArrowLeftRight', colour: '#6B7280', isSystem: true },
  // Other
  { group: 'Other', name: 'Uncategorised',        icon: 'HelpCircle',    colour: '#6B7280', isSystem: true },
  // Lifestyle (continued)
  { group: 'Lifestyle', name: 'Alcohol',           icon: 'Wine',          colour: '#F87171', isSystem: true },
  // Health (continued)
  { group: 'Health', name: 'Personal Care',        icon: 'Sparkles',      colour: '#A78BFA', isSystem: true },
  // Other (continued)
  { group: 'Other', name: 'Discretionary Spending', icon: 'ShoppingBag',  colour: '#6B7280', isSystem: true },
];

// Fixed IDs so the seed is idempotent across DB reopens
const SEED_IDS = DEFAULT_CATEGORIES.map((_, i) => `sys-cat-${String(i).padStart(3, '0')}`);

export async function seedDefaultCategories(): Promise<void> {
  const db = getDB();
  // Use bulkPut (upsert) so re-running is always safe
  const cats: Category[] = DEFAULT_CATEGORIES.map((c, i) => ({
    ...c,
    id: SEED_IDS[i],
  }));
  await db.categories.bulkPut(cats);
}

export async function getCategories(): Promise<Category[]> {
  return getDB().categories.orderBy('group').toArray();
}

export async function getCategory(id: string): Promise<Category | undefined> {
  return getDB().categories.get(id);
}

export async function createCategory(
  data: Omit<Category, 'id'>
): Promise<Category> {
  const category: Category = { ...data, id: uuidv4() };
  await getDB().categories.add(category);
  return category;
}

export async function updateCategory(
  id: string,
  changes: Partial<Category>
): Promise<void> {
  await getDB().categories.update(id, changes);
}

export async function deleteCategory(id: string): Promise<void> {
  await getDB().categories.delete(id);
}

/** Returns a map of category name (lowercase) → id for fast lookups */
export async function getCategoryMap(): Promise<Map<string, string>> {
  const cats = await getCategories();
  return new Map(cats.map((c) => [c.name.toLowerCase(), c.id]));
}
