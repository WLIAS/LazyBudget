// lib/db/accounts.ts — Account CRUD

import { v4 as uuidv4 } from 'uuid';
import { getDB, type Account } from './index';

export async function createAccount(
  data: Omit<Account, 'id' | 'createdAt'>
): Promise<Account> {
  const db = getDB();
  const account: Account = {
    ...data,
    id: uuidv4(),
    createdAt: new Date().toISOString(),
  };
  await db.accounts.add(account);
  return account;
}

export async function getAccounts(): Promise<Account[]> {
  return getDB().accounts.orderBy('name').toArray();
}

export async function getAccount(id: string): Promise<Account | undefined> {
  return getDB().accounts.get(id);
}

export async function updateAccount(
  id: string,
  changes: Partial<Account>
): Promise<void> {
  await getDB().accounts.update(id, changes);
}

export async function deleteAccount(id: string): Promise<void> {
  const db = getDB();
  await db.accounts.delete(id);
  // Also delete associated transactions
  await db.transactions.where('accountId').equals(id).delete();
}
