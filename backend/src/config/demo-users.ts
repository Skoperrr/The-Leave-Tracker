import type { Role } from '../repositories/access.js';

type DemoMembership = { slug: string; role: Role; managerEmail?: string };
export type DemoUser = { email: string; fullName: string; memberships: DemoMembership[] };

// Reserved example.com addresses; createUser sends no invitations or email.
export const demoUsers: DemoUser[] = [
  { email: 'thabo.demo@example.com', fullName: 'Thabo Demo', memberships: [{ slug: 'dlab', role: 'MANAGER' }] },
  { email: 'lerato.demo@example.com', fullName: 'Lerato Demo', memberships: [{ slug: 'field-institute', role: 'MANAGER' }] },
  { email: 'sibusiso.demo@example.com', fullName: 'Sibusiso Demo', memberships: [{ slug: 'strideshift-global', role: 'MANAGER' }] },
  { email: 'naledi.admin.demo@example.com', fullName: 'Naledi Demo Admin', memberships: [
    { slug: 'dlab', role: 'ADMIN' }, { slug: 'field-institute', role: 'ADMIN' }, { slug: 'strideshift-global', role: 'ADMIN' },
  ] },
  { email: 'ayanda.demo@example.com', fullName: 'Ayanda Demo', memberships: [
    { slug: 'dlab', role: 'EMPLOYEE', managerEmail: 'thabo.demo@example.com' },
    { slug: 'field-institute', role: 'EMPLOYEE', managerEmail: 'lerato.demo@example.com' },
  ] },
  { email: 'neo.demo@example.com', fullName: 'Neo Demo', memberships: [
    { slug: 'strideshift-global', role: 'EMPLOYEE', managerEmail: 'sibusiso.demo@example.com' },
  ] },
];
