// Community features are SIMULATIONS only: no data leaves the browser and nobody real is alerted.
export const HELPERS = [{ name: 'Asha (fictional)', skill: 'Guides to public places' }, { name: 'Rohan (fictional)', skill: 'Helps locate police stations' }]
export const REASONS = ['Feeling unsafe', 'Need help reaching a public place', 'Need help locating a police station', 'Medical assistance', 'Road or transport problem', 'Other concern']
export const CATS = ['Broken streetlight', 'Poorly lit road', 'Unsafe road condition', 'Public infrastructure problem', 'Other concern']
export const STEPS = ['Request submitted', 'Looking for simulated community helpers', 'Simulated helper responded', 'Assistance coordinated', 'Resolved']
export type Status = 'pending' | 'reviewed' | 'rejected'
export interface Report { id: string; cat: string; desc: string; loc: string; status: Status }
export interface Sess { id: string; step: number; cancelled: boolean; reason: string; share: boolean }
