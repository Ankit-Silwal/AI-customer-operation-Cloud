import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Heart,
  Leaf,
  LoaderCircle,
  MessageCircle,
  Package,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  color: string;
  shape: string;
  description: string;
};
const products: Product[] = [
  {
    id: "vase",
    name: "The Solstice Vase",
    category: "For the quiet corners",
    price: 48,
    color: "#b87550",
    shape: "vase",
    description:
      "A sculptural stoneware vase in a sun-warmed terracotta glaze. A home for a few branches, or a beautiful object all on its own. Wipe clean with a soft damp cloth.",
  },
  {
    id: "cup",
    name: "The Everyday Cup",
    category: "For the daily rituals",
    price: 24,
    color: "#cfb98e",
    shape: "cup",
    description:
      "A generous glazed stoneware cup for slow mornings and one more page. Dishwasher-safe, though a gentle hand wash will keep the glaze at its best. Avoid the microwave and sudden changes in temperature.",
  },
  {
    id: "bowl",
    name: "The Gather Bowl",
    category: "For coming together",
    price: 38,
    color: "#7c8969",
    shape: "bowl",
    description:
      "A softly rounded glazed stoneware bowl in an olive finish. Made for fruit, shared snacks, and whatever the day brings. Dishwasher-safe; hand washing is recommended. Not for oven or microwave use.",
  },
  {
    id: "linen",
    name: "The Sunday Linen",
    category: "For a softer table",
    price: 32,
    color: "#ba9273",
    shape: "linen",
    description:
      "A pair of European flax linen napkins in a soft, earthy shade. Wash gently in cold water and air dry. Skip the bleach and welcome the natural creases.",
  },
];
const api = async <T,>(path: string, body?: unknown): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: "same-origin",
      ...(body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
  } catch {
    throw new ChatError(
      "We couldn’t connect. Check your connection and try again.",
    );
  }
  const result = await response.json();
  if (!response.ok)
    throw new ChatError(
      result.error ?? "Our assistant couldn’t complete that request.",
      Number(response.headers.get("retry-after") ?? 0),
    );
  return result as T;
};
class ChatError extends Error {
  constructor(
    message: string,
    readonly retryAfter = 0,
  ) {
    super(message);
  }
}
interface Status {
  ready: boolean;
  mode: "retrieval" | "generation" | "preparing";
}
interface Source {
  title: string;
  text: string;
  documentId: string;
}
interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

function ProductArt({ product }: { product: Product }) {
  return (
    <svg
      viewBox="0 0 320 300"
      role="img"
      aria-label={`${product.name}, an illustrated demo product`}
    >
      <defs>
        <filter id={`shadow-${product.id}`}>
          <feGaussianBlur stdDeviation="8" />
        </filter>
        <linearGradient
          id={`glaze-${product.id}`}
          x1="0"
          y1="0"
          x2="1"
          y2=".15"
        >
          <stop stopColor={product.color} />
          <stop offset=".4" stopColor={product.color} />
          <stop offset="1" stopColor="#4f3527" />
        </linearGradient>
      </defs>
      <ellipse
        cx="164"
        cy="252"
        rx="80"
        ry="11"
        fill="#7e5b3c"
        opacity=".17"
        filter={`url(#shadow-${product.id})`}
      />
      {product.shape === "vase" ? (
        <g>
          <path
            d="M137 62h46v40c0 19 33 36 37 74 5 42-14 72-60 72s-65-30-60-72c4-38 37-55 37-74Z"
            fill={`url(#glaze-${product.id})`}
          />
          <ellipse cx="160" cy="62" rx="23" ry="6" fill="#815337" />
          <ellipse cx="160" cy="63" rx="17" ry="3" fill="#4b3829" />
          <path
            d="M149 107c-2 31-27 46-29 79-1 22 3 33 11 41"
            fill="none"
            stroke="#fff2ce"
            opacity=".16"
            strokeWidth="7"
            strokeLinecap="round"
          />
        </g>
      ) : product.shape === "cup" ? (
        <g>
          <path
            d="M224 126c47-13 51 62 3 61"
            stroke="#a6916d"
            strokeWidth="19"
            fill="none"
          />
          <path
            d="M94 112h135l-11 108c-2 22-111 22-114 0Z"
            fill={`url(#glaze-${product.id})`}
          />
          <ellipse cx="162" cy="112" rx="68" ry="16" fill="#dac9aa" />
          <ellipse cx="162" cy="112" rx="58" ry="10" fill="#8e7959" />
          <path
            d="m111 137 8 73"
            stroke="#fff7df"
            opacity=".18"
            strokeWidth="7"
            strokeLinecap="round"
          />
        </g>
      ) : product.shape === "bowl" ? (
        <g>
          <path
            d="M62 143h200c-9 66-40 99-100 99s-91-33-100-99"
            fill={`url(#glaze-${product.id})`}
          />
          <ellipse cx="162" cy="143" rx="100" ry="28" fill="#a1aa8b" />
          <ellipse cx="162" cy="143" rx="87" ry="20" fill="#667450" />
          <ellipse
            cx="145"
            cy="137"
            rx="55"
            ry="8"
            fill="#c2cbb1"
            opacity=".25"
          />
        </g>
      ) : (
        <g transform="rotate(-12 160 180)">
          <path d="m77 119 156 7 7 117-163-6Z" fill="#bca78b" />
          <path d="m82 105 154 5 5 112-158-8Z" fill="#d8c5a7" />
          <path d="m86 92 151 9 3 101-153-8Z" fill={product.color} />
          {Array.from({ length: 17 }, (_, i) => (
            <path
              key={i}
              d={`M${95 + i * 8} 100v95`}
              stroke="#fff2dc"
              strokeWidth=".7"
              opacity=".25"
            />
          ))}
          <path
            d="m86 193 155 8"
            stroke="#7a5c44"
            strokeWidth="2"
            strokeDasharray="2 3"
          />
        </g>
      )}
    </svg>
  );
}

export function App() {
  const [chat, setChat] = useState(false);
  const [prefill, setPrefill] = useState("");
  const [selected, setSelected] = useState<Product>();
  const [saved, setSaved] = useState<string[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem("oak-saved-pieces") ?? "[]",
      ) as string[];
    } catch {
      return [];
    }
  });
  const [filterSaved, setFilterSaved] = useState(false);
  const [status, setStatus] = useState<Status>();
  const productDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let active = true;
    async function check() {
      try {
        const result = await api<Status>("/status");
        if (active) setStatus(result);
      } catch {
        if (active) setStatus({ ready: false, mode: "preparing" });
      }
    }
    void check();
    const timer = setInterval(() => {
      void check();
    }, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    localStorage.setItem("oak-saved-pieces", JSON.stringify(saved));
  }, [saved]);
  useEffect(() => {
    if (selected) productDialog.current?.showModal();
  }, [selected]);
  function ask(question = "") {
    setSelected(undefined);
    setPrefill(question);
    setChat(true);
  }
  const visible = filterSaved
    ? products.filter((product) => saved.includes(product.id))
    : products;
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="demo-banner">
        <span>
          <span className="banner-dot" /> A demonstration company, thoughtfully
          supported by <strong>hearth.</strong>
        </span>
        <a
          href={`${window.location.protocol}//${window.location.hostname}:3030`}
          target="_blank"
          rel="noreferrer"
        >
          Explore the workspace <ArrowUpRight size={13} />
        </a>
      </div>
      <div className="shop-announcement">
        A little something for home. Complimentary shipping on orders $75+.
      </div>
      <header className="shop-header">
        <a href="#" className="oak-brand" aria-label="Oak and Ember home">
          oak <span>&</span> ember
          <span className="brand-leaf" aria-hidden="true">
            ✳
          </span>
        </a>
        <nav aria-label="Shop navigation">
          <a href="#collection">The collection</a>
          <a href="#story">Our way of making</a>
          <a href="#care">A little help</a>
        </nav>
        <div className="shop-header-actions">
          <button
            className={`saved-button ${filterSaved ? "active" : ""}`}
            aria-label={filterSaved ? "Show all pieces" : "Show saved pieces"}
            aria-pressed={filterSaved}
            onClick={() => {
              setFilterSaved(!filterSaved);
              document
                .getElementById("collection")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <Heart size={19} fill={filterSaved ? "currentColor" : "none"} />
            <span>{saved.length}</span>
          </button>
          <button className="shop-button outline small" onClick={() => ask()}>
            <MessageCircle size={15} /> Ask our team
          </button>
        </div>
      </header>
      <main id="main">
        <section className="shop-hero">
          <div className="hero-copy">
            <span className="eyebrow">Considered objects. Everyday joy.</span>
            <h1>
              For a home
              <br />
              that feels
              <br />
              <em>like you.</em>
            </h1>
            <p>
              Earthy textures. Honest materials. Little things to make the
              ordinary feel a little more special.
            </p>
            <a href="#collection" className="shop-button dark">
              Find your everyday favourite <ArrowRight size={17} />
            </a>
            <span className="hero-note">
              <Leaf size={14} /> Made with intention. Kept with love.
            </span>
          </div>
          <div className="hero-image">
            <img
              src="/oak-and-ember-hero.png"
              alt="Terracotta and cream ceramic vases with olive branches on a walnut sideboard in warm afternoon sunlight"
              fetchPriority="high"
            />
            <span className="image-caption">
              The art of a slower afternoon.
            </span>
            <span className="image-stamp" aria-hidden="true">
              A LITTLE
              <br />
              WARMTH
              <br />
              <i>for home</i>
            </span>
          </div>
          <a
            href="#collection"
            className="hero-scroll"
            aria-label="Scroll to the collection"
          >
            <ArrowDown size={17} />
          </a>
        </section>
        <section className="shop-values" aria-label="Our approach">
          <span>
            <Leaf size={18} /> Natural materials, honest character
          </span>
          <i />
          <span>
            <Package size={18} /> Carefully packed, happily received
          </span>
          <i />
          <span>
            <Heart size={18} /> Objects worth holding on to
          </span>
        </section>
        <section className="collection section-width" id="collection">
          <div className="section-heading">
            <div>
              <span className="eyebrow">A few good things</span>
              <h2>
                {filterSaved
                  ? "Your little favourites."
                  : "The everyday collection."}
              </h2>
            </div>
            <div>
              <p>
                {filterSaved
                  ? `${saved.length} saved ${saved.length === 1 ? "piece" : "pieces"}, for another look.`
                  : "Simple pieces. A quiet kind of beautiful."}
              </p>
              <button
                className="shop-text-link"
                onClick={() => setFilterSaved(!filterSaved)}
              >
                {filterSaved ? "See all pieces" : "View saved pieces"}
                <ArrowUpRight size={15} />
              </button>
            </div>
          </div>
          <div className="product-grid">
            {visible.map((product) => (
              <article className="product" key={product.id}>
                <div className={`product-image ${product.id}`}>
                  <button
                    className="product-open"
                    onClick={() => setSelected(product)}
                    aria-label={`View ${product.name}`}
                  >
                    <ProductArt product={product} />
                  </button>
                  <button
                    className="product-heart"
                    aria-label={`${saved.includes(product.id) ? "Unsave" : "Save"} ${product.name}`}
                    aria-pressed={saved.includes(product.id)}
                    onClick={() =>
                      setSaved((current) =>
                        current.includes(product.id)
                          ? current.filter((id) => id !== product.id)
                          : [...current, product.id],
                      )
                    }
                  >
                    <Heart
                      size={17}
                      fill={
                        saved.includes(product.id) ? "currentColor" : "none"
                      }
                    />
                  </button>
                  <span className="product-tag">
                    {product.id === "vase"
                      ? "A warm welcome"
                      : product.id === "cup"
                        ? "A daily companion"
                        : product.id === "bowl"
                          ? "Made for sharing"
                          : "Slow Sunday energy"}
                  </span>
                </div>
                <div className="product-title">
                  <button onClick={() => setSelected(product)}>
                    {product.name}
                  </button>
                  <span>${product.price}</span>
                </div>
                <p>{product.category}</p>
              </article>
            ))}
          </div>
          {!visible.length && (
            <div className="saved-empty">
              <Heart size={30} />
              <h3>A little room for favourites.</h3>
              <p>
                Tap the heart on a piece you love. We’ll keep it here for
                another look.
              </p>
              <button
                className="shop-button outline"
                onClick={() => setFilterSaved(false)}
              >
                Explore the collection
              </button>
            </div>
          )}
          <p className="collection-note">
            An illustrative collection for this demo. No checkout, real orders,
            or payments.
          </p>
        </section>
        <section className="story-section" id="story">
          <div className="story-art" aria-hidden="true">
            <span className="story-sun">✳</span>
            <svg viewBox="0 0 320 260">
              <path
                d="M142 55h36v35c0 21 43 44 43 86 0 34-21 52-61 52s-61-18-61-52c0-42 43-65 43-86Z"
                fill="#aa694a"
              />
              <ellipse cx="160" cy="55" rx="18" ry="5" fill="#724c34" />
              <path
                d="M160 56c-2-31 1-44 14-61M160 28c-30 7-44-5-48-18 22-6 35-2 48 18M165 12c24 5 37-2 44-17-22-7-34-2-44 17"
                fill="#6c7956"
              />
              <path d="M63 229h193" stroke="#bc9e7c" strokeWidth="2" />
              <path d="m59 235 202 1" stroke="#cdb496" strokeWidth="4" />
            </svg>
            <span className="story-art-note">
              Nothing loud.
              <br />
              Just things that feel right.
            </span>
          </div>
          <div className="story-copy">
            <span className="eyebrow">Our way of making</span>
            <h2>
              Less, but
              <br />
              <em>a little lovelier.</em>
            </h2>
            <p>
              We believe a home is made in the small moments. The first cup of
              the day. A table set for friends. A branch brought in from a
              morning walk.
            </p>
            <p>
              Oak & Ember is a fictional shop built around that feeling:
              considered materials, tactile shapes, and a little warmth in
              everything.
            </p>
            <button
              className="shop-text-link"
              onClick={() => ask("How should I care for your ceramics?")}
            >
              A note on caring for your pieces <ArrowRight size={16} />
            </button>
          </div>
        </section>
        <section className="care-section section-width" id="care">
          <div className="care-intro">
            <span className="eyebrow">Good care goes both ways</span>
            <h2>
              A question?
              <br />
              <em>Make yourself at home.</em>
            </h2>
            <p>
              From delivery days to keeping your favourite cup happy, our
              assistant can help you find the right passage in our policies.
            </p>
            <button className="shop-button dark" onClick={() => ask()}>
              <MessageCircle size={17} /> Let’s have a little chat{" "}
              <ArrowUpRight size={15} />
            </button>
            <span className="care-note">
              A real knowledge connection. A fictional company.
            </span>
          </div>
          <div className="faq-list">
            {[
              {
                title: "How long until my order feels like home?",
                answer:
                  "Standard delivery takes 3–5 business days after dispatch. Orders are dispatched within 2 business days. Standard shipping is $6, and free on orders of $75 or more.",
              },
              {
                title: "What if a piece isn’t quite right for me?",
                answer:
                  "Unused pieces in their original packaging can be returned within 30 days of delivery. Email care@oakandember.example with your order number for instructions. Customer-paid return postage applies, except for confirmed damage or incorrect items.",
              },
              {
                title: "How do I keep my ceramics looking lovely?",
                answer:
                  "Our glazed stoneware cups and bowls are dishwasher-safe, but we recommend a gentle hand wash. Keep ceramics out of the microwave, oven, and freezer. Wipe decorative vases with a soft damp cloth.",
              },
              {
                title: "Can I talk to someone about a damaged piece?",
                answer:
                  "Of course. Email care@oakandember.example within 48 hours of delivery, with your order number and photos of the item and its packaging. Keep the packaging until you hear from our team.",
              },
            ].map((item) => (
              <details key={item.title}>
                <summary>
                  {item.title}
                  <ChevronDown size={17} />
                </summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="shop-closing">
          <span className="closing-flower" aria-hidden="true">
            ✳
          </span>
          <h2>A little warmth, every day.</h2>
          <p>Objects to live with. A home to grow into.</p>
          <a href="#collection" className="shop-text-link">
            Find something that feels like you <ArrowRight size={16} />
          </a>
        </section>
      </main>
      <footer className="shop-footer">
        <div>
          <a href="#" className="oak-brand">
            oak <span>&</span> ember
          </a>
          <p>A considered home. A little more heart.</p>
          <span>A fictional company demonstrating Hearth.</span>
        </div>
        <div>
          <span className="footer-label">TAKE A LOOK AROUND</span>
          <a href="#collection">The collection</a>
          <a href="#story">Our way of making</a>
          <a href="#care">Delivery, returns & care</a>
        </div>
        <div>
          <span className="footer-label">A LITTLE HELP</span>
          <button onClick={() => ask()}>
            Ask our assistant <ArrowUpRight size={14} />
          </button>
          <a href="mailto:care@oakandember.example">care@oakandember.example</a>
          <small>Demo address · No real messages are delivered.</small>
        </div>
        <div className="shop-footer-bottom">
          <span>
            Oak & Ember · Demo collection · {new Date().getFullYear()}
          </span>
          <span>
            <ShieldCheck size={13} /> Thoughtful support, powered by Hearth
          </span>
        </div>
      </footer>
      <button
        className="chat-launcher"
        onClick={() => ask()}
        aria-label="Open Oak and Ember support assistant"
        aria-expanded={chat}
      >
        <MessageCircle size={21} />
        <span>A little help?</span>
        <span className="launcher-dot" />
      </button>
      {chat && (
        <Chat
          status={status}
          prefill={prefill}
          close={() => {
            setChat(false);
            setPrefill("");
          }}
        />
      )}
      {selected && (
        <dialog
          ref={productDialog}
          className="product-dialog"
          onCancel={() => setSelected(undefined)}
          onClick={(event) => {
            if (event.currentTarget === event.target) setSelected(undefined);
          }}
        >
          <button
            className="product-dialog-close"
            aria-label="Close product details"
            onClick={() => setSelected(undefined)}
          >
            <X size={20} />
          </button>
          <div className={`product-detail-art ${selected.id}`}>
            <ProductArt product={selected} />
          </div>
          <div className="product-detail-copy">
            <span className="eyebrow">{selected.category}</span>
            <h2>{selected.name}</h2>
            <span className="detail-price">
              ${selected.price} · Illustrative demo price
            </span>
            <p>{selected.description}</p>
            <span className="demo-product-note">
              A fictional product. Purchases are not available in this demo.
            </span>
            <button
              className="shop-button dark"
              onClick={() =>
                ask(`What should I know about caring for ${selected.name}?`)
              }
            >
              <MessageCircle size={17} /> Ask about this piece
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}

function Chat({
  status,
  prefill,
  close,
}: {
  status?: Status;
  prefill: string;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState(prefill);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryUntil, setRetryUntil] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const [expanded, setExpanded] = useState<number>();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    let active = true;
    api<{ messages: Message[] }>("/support")
      .then((value) => {
        if (active) setMessages(value.messages);
      })
      .catch((failure) => {
        if (active && status?.ready) setError(failure.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    scroller.current?.scrollTo({
      top: scroller.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, pending, error]);
  useEffect(() => {
    if (retryUntil <= Date.now()) return;
    const interval = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [retryUntil]);
  const retry = Math.max(0, Math.ceil((retryUntil - clock) / 1000));
  async function send(event: FormEvent) {
    event.preventDefault();
    if (pending || !question.trim() || retry || !status?.ready) return;
    const sent = question.trim();
    setPending(true);
    setError("");
    try {
      const result = await api<{
        answer: string;
        sources: Source[];
        mode: string;
      }>("/support", { question: sent });
      setMessages((current) => [
        ...current,
        { role: "user", content: sent },
        { role: "assistant", content: result.answer, sources: result.sources },
      ]);
      setQuestion("");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Please try again.",
      );
      if (failure instanceof ChatError && failure.retryAfter) {
        setRetryUntil(Date.now() + failure.retryAfter * 1000);
        setClock(Date.now());
      }
    } finally {
      setPending(false);
      input.current?.focus();
    }
  }
  async function reset() {
    if (
      pending ||
      !window.confirm(
        "Start a new chat? This will clear the conversation from this browser.",
      )
    )
      return;
    try {
      await api("/support/reset", {});
      setMessages([]);
      setQuestion("");
      setError("");
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Please try again.",
      );
    }
  }
  return (
    <dialog
      className="chat-dialog"
      ref={dialog}
      aria-labelledby="chat-title"
      onCancel={close}
    >
      <header className="chat-header">
        <span className="chat-brand-icon" aria-hidden="true">
          ✳
        </span>
        <div>
          <h2 id="chat-title">A little help from Oak & Ember</h2>
          <span>
            <i />
            {status?.ready
              ? "Grounded in our company policies"
              : "Getting our knowledge ready…"}
          </span>
        </div>
        <button
          aria-label="Start a new chat"
          onClick={() => {
            void reset();
          }}
          disabled={pending}
        >
          <RefreshCw size={15} />
        </button>
        <button aria-label="Close support assistant" onClick={close}>
          <X size={19} />
        </button>
      </header>
      <div className="chat-mode">
        <Sparkles size={13} />
        {status?.mode === "generation"
          ? "AI assistant · Answers with sources"
          : "Policy lookup · Direct passages, no AI-written claims"}
      </div>
      <div className="chat-scroll" ref={scroller}>
        <div className="chat-message assistant">
          <span className="chat-message-author">Oak & Ember care</span>
          <p>
            Hello, make yourself at home. I can help with delivery, returns, and
            caring for your pieces. What’s on your mind?
          </p>
        </div>
        {loading && (
          <div className="chat-loading">
            <LoaderCircle className="spin" size={17} />
            Opening your conversation…
          </div>
        )}
        {!messages.length && !loading && (
          <div className="chat-suggestions">
            {[
              "What is your return policy?",
              "How long does delivery take?",
              "My item arrived damaged. What now?",
            ].map((value) => (
              <button
                key={value}
                onClick={() => {
                  setQuestion(value);
                  input.current?.focus();
                }}
              >
                {value}
                <ArrowUpRight size={14} />
              </button>
            ))}
          </div>
        )}
        {messages.map((message, index) => (
          <div className={`chat-message ${message.role}`} key={index}>
            <span className="chat-message-author">
              {message.role === "user" ? "You" : "Oak & Ember care"}
            </span>
            <p>{message.content}</p>
            {Boolean(message.sources?.length) && (
              <div className="chat-sources">
                <button
                  aria-expanded={expanded === index}
                  onClick={() =>
                    setExpanded(expanded === index ? undefined : index)
                  }
                >
                  <BookIcon /> From our customer care handbook{" "}
                  <ChevronDown size={12} />
                </button>
                {expanded === index &&
                  message.sources?.map((source, sourceIndex) => (
                    <blockquote key={sourceIndex}>
                      <strong>{source.title}</strong>
                      <span>{source.text}</span>
                    </blockquote>
                  ))}
              </div>
            )}
          </div>
        ))}
        {pending && (
          <div className="chat-thinking" role="status">
            <span />
            <span />
            <span /> Finding a little clarity…
          </div>
        )}
        {error && (
          <div className="chat-error" role="alert">
            {error}
            {retry > 0 && <small>Ready to try again in {retry}s.</small>}
          </div>
        )}
      </div>
      <form className="chat-form" onSubmit={send}>
        <label htmlFor="shop-question" className="sr-only">
          Your question for Oak and Ember
        </label>
        <textarea
          ref={input}
          id="shop-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={2000}
          placeholder="Ask about delivery, returns, or care…"
          rows={2}
          required
          disabled={!status?.ready}
        />
        <button
          type="submit"
          aria-label="Send your question"
          disabled={pending || !question.trim() || retry > 0 || !status?.ready}
        >
          {pending ? (
            <LoaderCircle size={18} className="spin" />
          ) : (
            <Send size={19} />
          )}
        </button>
      </form>
      <footer className="chat-footer">
        <span>
          <Check size={12} /> Conversation saved privately for this browser.
        </span>
        <small>
          Demo company · No live orders · Powered by <strong>hearth.</strong>
        </small>
      </footer>
    </dialog>
  );
}
function BookIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 3C5 1 2 2 1 2v10c2-1 5 0 7 1m0-10c3-2 6-1 7-1v10c-2-1-5 0-7 1V3Z"
        stroke="currentColor"
      />
    </svg>
  );
}
