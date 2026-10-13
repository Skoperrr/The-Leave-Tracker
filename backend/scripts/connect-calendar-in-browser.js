// Optional backend verification helper; no frontend component changes.
// Open the deployed app, sign in as an organisation ADMIN, then run this
// in that page's browser console. It never prints passwords or access tokens.
// Change organisationName to connect another organisation separately.
(async () => {
  const organisationName = 'D-Lab';
  if (window.location.origin !== 'https://the-leave-tracker-skfc.vercel.app') {
    throw new Error('Open the Leave Tracker deployment before using this helper.');
  }
  const key = Object.keys(localStorage).find(name => /^sb-.+-auth-token$/.test(name));
  const session = key ? JSON.parse(localStorage.getItem(key) || 'null') : null;
  if (!session?.access_token) throw new Error('Sign in to the app as an organisation administrator first.');
  const headers = { Authorization: `Bearer ${session.access_token}` };
  const meResponse = await fetch('/api/v1/me', { headers });
  if (!meResponse.ok) throw new Error('Your application profile could not be verified.');
  const me = (await meResponse.json()).data;
  const membership = me.memberships.find(item => item.organisationName === organisationName && item.active && item.role === 'ADMIN');
  if (!membership) throw new Error(`An ADMIN membership in ${organisationName} is required.`);
  const response = await fetch(`/api/v1/integrations/google/connect?organisationId=${encodeURIComponent(membership.organisationId)}`, {
    headers, credentials: 'include',
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || 'Calendar connection could not start.');
  const destination = new URL(result.data.authorisationUrl);
  if (destination.protocol !== 'https:' || destination.hostname !== 'accounts.google.com') throw new Error('Unexpected Google authorisation destination.');
  window.location.assign(destination.href);
})().catch(error => console.error(error.message));
