/** Personal bot demonstration only: withdrawals must be positive and affordable. */
export function canWithdraw(balance: number, amount: number): boolean {
  return amount > 0 && amount <= balance;
}
