import { useId } from "react";
import "./ai-visuals.css";

export function AiLoader({
  label,
  detail,
}: {
  label: string;
  detail?: string;
}) {
  const gradient = useId();
  return (
    <div className="ai-loader" role="status" aria-live="polite">
      <span className="ai-loader-symbol" aria-hidden="true">
        <span className="ai-loader-orbit" />
        <svg className="ai-loader-spark" viewBox="0 0 48 48" fill="none">
          <defs>
            <linearGradient
              id={gradient}
              x1="4"
              y1="8"
              x2="42"
              y2="40"
              gradientUnits="userSpaceOnUse"
            >
              <stop stopColor="#4285f4" />
              <stop offset=".5" stopColor="#a879ee" />
              <stop offset="1" stopColor="#ed8092" />
            </linearGradient>
          </defs>
          <path
            fill={`url(#${gradient})`}
            d="M24 3C21 16 16 21 3 24c13 3 18 8 21 21 3-13 8-18 21-21C32 21 27 16 24 3Z"
          />
        </svg>
        <span className="ai-loader-dot" />
      </span>
      <span className="ai-loader-copy">
        <strong>
          {label}
          <span className="ai-loader-ellipsis" aria-hidden="true">
            …
          </span>
        </strong>
        {detail && <span className="caption">{detail}</span>}
      </span>
    </div>
  );
}
