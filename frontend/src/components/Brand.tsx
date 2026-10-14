export function Brand() {
  return (
    <>
      <span className="brand-symbol" aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none">
          <rect
            x="8"
            y="11"
            width="32"
            height="29"
            rx="7"
            stroke="currentColor"
            strokeWidth="2.5"
          />
          <path
            d="M8 20h32M17 7v9M31 7v9"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="m17 29 5 5 10-10"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="brand-wordmark">
        The Leave Tracker<small>LEAVE, TOGETHER</small>
      </span>
    </>
  );
}
