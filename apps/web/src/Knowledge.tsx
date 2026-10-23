import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  Download,
  FileText,
  Plus,
  Search,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { api, post, type Document, type Organization, type Page } from "./api";
import {
  date,
  Empty,
  ErrorNotice,
  Modal,
  Pager,
  Spinner,
  useDebounced,
  useResource,
} from "./components";
import { PageHeading } from "./App";

export function Knowledge({ organization }: { organization: Organization }) {
  const [search, setSearch] = useState("");
  const delayedSearch = useDebounced(search);
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState("");
  const [mode, setMode] = useState<"text" | "file">("text");
  const [file, setFile] = useState<File>();
  const [title, setTitle] = useState("");
  const [saved, setSaved] = useState<Document>();
  const [pending, setPending] = useState(false);
  const [indexing, setIndexing] = useState("");
  const [indexed, setIndexed] = useState<Set<string>>(new Set());
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState("");
  const list = useResource<Page<Document>>(
    `/documents?organizationId=${organization.id}&page=${page}&pageSize=12&search=${encodeURIComponent(delayedSearch)}`,
  );
  const detail = useResource<Document>(
    selected ? `/documents/${selected}` : null,
  );
  async function index(id: string) {
    if (indexing) return;
    setIndexing(id);
    setError(undefined);
    setNotice("");
    try {
      const result = await post<{ chunks: number }>(
        `/rag/documents/${id}/index`,
        {},
      );
      setIndexed((current) => new Set([...current, id]));
      setNotice(
        `Ready for questions. ${result.chunks} searchable ${result.chunks === 1 ? "passage" : "passages"} created.`,
      );
    } catch (failure) {
      setError(failure);
    } finally {
      setIndexing("");
    }
  }
  function openAdd() {
    setMode("text");
    setFile(undefined);
    setTitle("");
    setSaved(undefined);
    setError(undefined);
    setNotice("");
    setAdding(true);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(undefined);
    try {
      let result: Document;
      if (mode === "file") {
        if (!file)
          throw new Error("Choose a PDF, Text, or Markdown file first.");
        if (file.size > 1048576)
          throw new Error("Choose a file no larger than 1 MB.");
        const upload = new FormData();
        upload.set("file", file);
        upload.set("organizationId", organization.id);
        upload.set("title", title);
        result = await api<Document>("/documents/upload", {
          method: "POST",
          body: upload,
        });
      } else
        result = await post<Document>("/documents", {
          organizationId: organization.id,
          title,
          content: form.get("content"),
        });
      setSaved(result);
      list.refresh();
    } catch (failure) {
      setError(failure);
    } finally {
      setPending(false);
    }
  }
  return (
    <section>
      <PageHeading
        label="Good answers start here"
        title="Your knowledge, gathered."
        description="Policies, product details, and the little things your customers need to know."
        action={
          <button className="button primary" onClick={openAdd}>
            <Plus size={17} /> Add a source
          </button>
        }
      />
      <div className="knowledge-note">
        <span className="stat-icon sage">
          <BookOpen size={20} />
        </span>
        <div>
          <strong>Give your assistant something good to work with.</strong>
          <p>
            Add a source, then index it to make it searchable. Your documents
            stay in this workspace.
          </p>
        </div>
        <span className="badge neutral">PDF · Text · Markdown</span>
      </div>
      <ErrorNotice error={!adding && error} clear={() => setError(undefined)} />
      {notice && !adding && (
        <div className="success-notice" role="status">
          <Check size={18} />
          {notice}
          <button
            className="icon-button"
            aria-label="Dismiss success"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <ErrorNotice error={list.error} />
      <section className="panel library-panel">
        <div className="library-toolbar">
          <div>
            <h2>
              All sources{" "}
              <span className="count-pill">{list.data?.total ?? "—"}</span>
            </h2>
            <p>A growing foundation for {organization.name}.</p>
          </div>
          <label className="search-field">
            <Search size={16} />
            <input
              aria-label="Search knowledge sources"
              placeholder="Find a source…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
        {list.loading ? (
          <div className="loading">
            <Spinner />
            Gathering your sources…
          </div>
        ) : !list.data?.items.length ? (
          <Empty
            title={
              search
                ? "No matching sources."
                : "Every good answer has a beginning."
            }
            action={
              <button className="button primary" onClick={openAdd}>
                <Plus size={16} /> Add your first source
              </button>
            }
          >
            {search
              ? "Try another title or clear your search."
              : "Start with a returns policy, an FAQ, or a product guide. A little context makes a big difference."}
          </Empty>
        ) : (
          <div className="source-table-wrap">
            <table className="source-table">
              <thead>
                <tr>
                  <th>Source name</th>
                  <th>Format</th>
                  <th>Added</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <button
                        className="source-name"
                        onClick={() => {
                          setSelected(item.id);
                          setError(undefined);
                        }}
                      >
                        <span className="file-icon">
                          <FileText size={20} />
                        </span>
                        <span>
                          <strong>{item.title}</strong>
                          <small>
                            {item.upload?.fileName ?? "Written knowledge"}
                          </small>
                        </span>
                      </button>
                    </td>
                    <td>
                      <span className="badge neutral">
                        {item.upload?.mediaType === "application/pdf"
                          ? "PDF"
                          : item.upload?.fileName.endsWith(".md")
                            ? "Markdown"
                            : "Text"}
                      </span>
                    </td>
                    <td>{date(item.createdAt)}</td>
                    <td>
                      <button
                        className={`button ${indexed.has(item.id) ? "sage-button" : "secondary"} compact`}
                        disabled={Boolean(indexing)}
                        onClick={() => {
                          void index(item.id);
                        }}
                      >
                        {indexing === item.id ? (
                          <Spinner />
                        ) : indexed.has(item.id) ? (
                          <>
                            <Check size={14} /> Indexed
                          </>
                        ) : (
                          <>
                            <Sparkles size={14} /> Index source
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager
          page={page}
          total={list.data?.total ?? 0}
          pageSize={12}
          change={setPage}
        />
      </section>
      <p className="quiet-help">
        Indexing can be repeated safely. Documents are immutable; add an updated
        version as a new source.
      </p>
      {adding && (
        <Modal
          title={saved ? "A little more knowledge." : "Add something helpful."}
          subtitle={
            saved
              ? "Your document is saved. Make it searchable when you’re ready."
              : "A clear source is the beginning of a clear answer."
          }
          close={() => !pending && !indexing && setAdding(false)}
        >
          <ErrorNotice error={error} />
          {saved ? (
            <div className="saved-source">
              <span className="saved-icon">
                <Check size={28} />
              </span>
              <h3>{saved.title}</h3>
              <p>
                {indexed.has(saved.id)
                  ? notice
                  : "Saved to your workspace. Index this source to include it in knowledge search."}
              </p>
              <button
                className="button primary full"
                disabled={Boolean(indexing) || indexed.has(saved.id)}
                onClick={() => {
                  void index(saved.id);
                }}
              >
                {indexing ? (
                  <>
                    <Spinner /> Creating searchable passages…
                  </>
                ) : indexed.has(saved.id) ? (
                  <>
                    <Check size={17} /> Ready for questions
                  </>
                ) : (
                  <>
                    <Sparkles size={17} /> Index this source
                  </>
                )}
              </button>
              <button
                className="button secondary full"
                onClick={() => setAdding(false)}
                disabled={Boolean(indexing)}
              >
                Back to the library <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <>
              <div className="auth-tabs" role="group" aria-label="Source type">
                <button
                  aria-pressed={mode === "text"}
                  className={mode === "text" ? "active" : ""}
                  onClick={() => {
                    setMode("text");
                    setError(undefined);
                  }}
                >
                  <FileText size={15} /> Write or paste text
                </button>
                <button
                  aria-pressed={mode === "file"}
                  className={mode === "file" ? "active" : ""}
                  onClick={() => {
                    setMode("file");
                    setError(undefined);
                  }}
                >
                  <Upload size={15} /> Upload a file
                </button>
              </div>
              <form onSubmit={save}>
                <label>
                  Source title
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    maxLength={255}
                    required
                    placeholder="For example, Returns & exchanges"
                    autoFocus
                  />
                </label>
                {mode === "text" ? (
                  <label>
                    What should your assistant know?
                    <textarea
                      className="knowledge-editor"
                      name="content"
                      maxLength={200000}
                      required
                      placeholder="Paste your policy, helpful guide, or frequently asked questions here…"
                    />
                  </label>
                ) : (
                  <label className="file-drop">
                    <Upload size={27} />
                    <strong>{file?.name ?? "Choose a source to upload"}</strong>
                    <span>PDF, .txt or .md · Up to 1 MB</span>
                    <input
                      type="file"
                      accept=".pdf,.txt,.md,.markdown"
                      required
                      onChange={(event) => {
                        const chosen = event.target.files?.[0];
                        setFile(chosen);
                        if (chosen && !title)
                          setTitle(chosen.name.replace(/\.[^.]+$/, ""));
                      }}
                    />
                  </label>
                )}
                <div className="modal-actions">
                  <button className="button primary" disabled={pending}>
                    {pending ? (
                      <Spinner />
                    ) : (
                      <>
                        Save source <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </>
          )}
        </Modal>
      )}
      {selected && (
        <Modal
          title={detail.data?.title ?? "Opening source…"}
          subtitle="The original knowledge in your workspace."
          close={() => !indexing && setSelected("")}
        >
          <ErrorNotice error={detail.error || error} />
          {detail.loading ? (
            <div className="loading">
              <Spinner />
            </div>
          ) : (
            detail.data && (
              <>
                <div className="source-metadata">
                  <span className="badge neutral">
                    Added {date(detail.data.createdAt)}
                  </span>
                  {detail.data.upload && (
                    <a
                      className="text-link"
                      href={`/api/documents/${selected}/download`}
                    >
                      <Download size={15} /> Download original
                    </a>
                  )}
                </div>
                <pre className="document-content">{detail.data.content}</pre>
                <div className="modal-actions">
                  <button
                    className="button primary"
                    disabled={Boolean(indexing)}
                    onClick={() => {
                      void index(selected);
                    }}
                  >
                    {indexing ? (
                      <Spinner />
                    ) : (
                      <>
                        <Sparkles size={16} /> Index or refresh source
                      </>
                    )}
                  </button>
                </div>
              </>
            )
          )}
        </Modal>
      )}
    </section>
  );
}
