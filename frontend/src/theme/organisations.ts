export const organisationThemes = {
  dlab: {
    key: "dlab",
    name: "D-Lab",
    code: "DLB",
    logo: "/brands/dlab.png",
    colour: "#1a294b",
  },
  field: {
    key: "field",
    name: "The Field Institute",
    code: "TFI",
    logo: "/brands/field.png",
    colour: "#080808",
  },
  stride: {
    key: "stride",
    name: "StrideShift Global",
    code: "SSG",
    logo: "/brands/stride.png",
    colour: "#182b4b",
  },
  default: {
    key: "default",
    name: "The Leave Tracker",
    code: "LT",
    logo: null,
    colour: "#123d36",
  },
} as const;
export function getOrganisationTheme(name: string) {
  const normalised = name.trim().toLowerCase();
  if (normalised === "d-lab") return organisationThemes.dlab;
  if (["the field institute", "field institute"].includes(normalised))
    return organisationThemes.field;
  if (normalised === "strideshift global") return organisationThemes.stride;
  return organisationThemes.default;
}
