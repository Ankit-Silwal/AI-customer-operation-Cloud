import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  X,
} from "lucide-react";
import { api, ApiError } from "./api";

export function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? "small" : ""}`}>
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      hearth<span className="brand-period">.</span>
    </span>
  );
}
export function Spinner() {
  return <LoaderCircle size={18} className="spin" aria-label="Loading" />;
}
export function ErrorNotice({
  error,
  clear,
}: {
  error: unknown;
  clear?: () => void;
}) {
  if (!error) return null;
  const message =
    error instanceof Error
      ? error.message
      : "We couldn’t complete this request. Please try again.";
  return (
    <div className="error-notice" role="alert">
      <AlertCircle size={19} />
      <div>
        {message}
        {error instanceof ApiError && error.retryAfter > 0 && (
          <small>
            Please wait {error.retryAfter} seconds before trying again.
          </small>
        )}
        {error instanceof ApiError && error.requestId && (
          <small>Reference: {error.requestId}</small>
        )}
      </div>
      {clear && (
        <button
          className="icon-button"
          onClick={clear}
          aria-label="Dismiss error"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-flower" aria-hidden="true">
        ✳
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  close,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => {
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-heading"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="modal-header">
        <div>
          <h2 id="modal-heading">{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Pager({
  page,
  total,
  pageSize,
  change,
}: {
  page: number;
  total: number;
  pageSize: number;
  change: (page: number) => void;
}) {
  return (
    <div className="pager">
      <span>
        {total
          ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`
          : "0 results"}
      </span>
      <div>
        <button
          className="icon-button"
          disabled={page <= 1}
          onClick={() => change(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          className="icon-button"
          disabled={page * pageSize >= total}
          onClick={() => change(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
export function useResource<T>(path: string | null) {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<unknown>();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(undefined);
    setError(undefined);
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void api<T>(path, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision]);
  return {
    data,
    loading,
    error,
    refresh: () => setRevision((value) => value + 1),
    setData,
  };
}
export const date = (value: string) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
    new Date(value),
  );
export function useDebounced(value: string) {
  const [delayed, setDelayed] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDelayed(value), 350);
    return () => clearTimeout(timer);
  }, [value]);
  return delayed;
}
export const demoUrl =
  import.meta.env.VITE_DEMO_URL ??
  `${window.location.protocol}//${window.location.hostname}:3035`;
export function DemoLink() {
  return (
    <a href={demoUrl} target="_blank" rel="noreferrer" className="text-link">
      Visit the demo company <ArrowUpRight size={16} />
    </a>
  );
}
