import { getOrganisationTheme } from "../theme/organisations";
export function OrganisationBrand({ name }: { name: string }) {
  const theme = getOrganisationTheme(name);
  return theme.logo ? (
    <div className={`institution-brand institution-brand-${theme.key}`}>
      <img src={theme.logo} alt={`${theme.name} logo`} />
      <span>{theme.code} WORKSPACE</span>
    </div>
  ) : null;
}
