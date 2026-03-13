import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BookOpen, Bookmark, ChevronLeft, ChevronRight, Clock3, Search, Share2, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import {
  BIBLE_BOOKS,
  buildChapterReference,
  getBookMeta,
  getBibleReaderTranslation,
  parseBibleReference,
} from "@/lib/bible";
import {
  useBiblePassage,
  useRecordRecentPassage,
  useRecentPassages,
  useRemoveSavedPassage,
  useSavedPassages,
  useSavePassage,
} from "@/hooks/useBible";

function PassageSidebarSection({
  title,
  icon: Icon,
  emptyText,
  children,
}: {
  title: string;
  icon: typeof Clock3;
  emptyText: string;
  children: ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="h-4 w-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {hasChildren ? children : <p className="text-sm text-muted-foreground">{emptyText}</p>}
      </CardContent>
    </Card>
  );
}

export default function Bible() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const defaultReference = "John 1";
  const defaultTranslation = getBibleReaderTranslation(null);
  const activeReference = searchParams.get("reference") || defaultReference;
  const translation = getBibleReaderTranslation(searchParams.get("translation"));
  const [finderMode, setFinderMode] = useState<"search" | "browse">("search");
  const [referenceInput, setReferenceInput] = useState<string>(activeReference);

  const { data: passage, isLoading, error } = useBiblePassage(activeReference, translation);
  const { data: savedPassages = [] } = useSavedPassages();
  const { data: recentPassages = [] } = useRecentPassages();
  const savePassage = useSavePassage();
  const removeSavedPassage = useRemoveSavedPassage();
  const recordRecentPassage = useRecordRecentPassage();
  const lastRecordedPassageId = useRef<string | null>(null);

  const parsedActiveReference = useMemo(
    () => parseBibleReference(activeReference),
    [activeReference]
  );
  const selectedBook = parsedActiveReference.book || "John";
  const selectedChapter = parsedActiveReference.chapter || 1;
  const selectedBookMeta = useMemo(() => getBookMeta(selectedBook), [selectedBook]);
  const chapterOptions = useMemo(
    () => Array.from({ length: selectedBookMeta?.chapters || 1 }, (_, index) => index + 1),
    [selectedBookMeta]
  );

  const savedMatch = useMemo(() => {
    if (!passage) return null;
    return savedPassages.find((item) => item.passage_cache_id === passage.id) || null;
  }, [passage, savedPassages]);

  useEffect(() => {
    setReferenceInput((current) => (current === activeReference ? current : activeReference));
  }, [activeReference]);

  useEffect(() => {
    if (!passage?.id) return;
    if (passage.id.startsWith("ephemeral:")) return;
    if (lastRecordedPassageId.current === passage.id) return;
    lastRecordedPassageId.current = passage.id;
    recordRecentPassage.mutate(passage);
  }, [passage?.id]);

  const updatePassageParams = (reference: string) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("reference", reference);
    nextParams.set("translation", translation);
    setSearchParams(nextParams, { replace: true });
  };

  const submitReference = (reference: string) => {
    const trimmed = reference.trim();
    if (!trimmed) return;
    setFinderMode("search");
    updatePassageParams(trimmed);
  };

  const jumpToChapter = (book: string, chapter: number) => {
    setFinderMode("browse");
    const nextReference = buildChapterReference(book, chapter);
    setReferenceInput(nextReference);
    updatePassageParams(nextReference);
  };

  const handleShareToFeed = () => {
    if (!passage) return;

    const params = new URLSearchParams();
    params.set("compose", "scripture");
    params.set("reference", passage.reference);
    params.set("body", passage.text.trim());

    navigate(`/feed?${params.toString()}`);
  };

  const canGoPrevious = selectedChapter > 1;
  const canGoNext = selectedBookMeta ? selectedChapter < selectedBookMeta.chapters : false;

  return (
    <div className="container mx-auto px-4 py-6 pb-32">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <section className="overflow-hidden rounded-[28px] border border-sky-200/60 bg-[radial-gradient(circle_at_top_left,rgba(186,230,253,0.65),transparent_36%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(240,249,255,0.92))] p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-300/60 bg-white/70 px-3 py-1 text-xs font-medium uppercase tracking-[0.22em] text-sky-900">
                  <Sparkles className="h-3.5 w-3.5" />
                  Bible Reader
                </div>
                <div>
                  <h1 className="font-display text-4xl font-semibold tracking-tight text-slate-950">Read Scripture in the app</h1>
                  <p className="mt-2 max-w-xl text-sm text-slate-700">
                    Search by reference, browse by book and chapter, and keep your saved and recent passages close.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-sky-200/70 bg-white/70 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Current translation</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">{translation}</p>
              </div>
            </div>
          </section>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-xl">
                <BookOpen className="h-5 w-5" />
                Find A Passage
              </CardTitle>
              <CardDescription>Look up a reference directly or browse chapter-by-chapter.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs value={finderMode} onValueChange={(value) => setFinderMode(value as "search" | "browse")} className="space-y-4">
                <TabsList className="grid h-auto w-full grid-cols-2">
                  <TabsTrigger value="search">Search</TabsTrigger>
                  <TabsTrigger value="browse">Browse</TabsTrigger>
                </TabsList>

                <TabsContent value="search" className="mt-0">
                  <form
                    className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]"
                    onSubmit={(event) => {
                      event.preventDefault();
                      submitReference(referenceInput);
                    }}
                  >
                    <Input
                      value={referenceInput}
                      onChange={(event) => setReferenceInput(event.target.value)}
                      placeholder="Try John 3 or Romans 8:1-11"
                    />
                    <Button type="submit" className="gap-2 md:min-w-32">
                      <Search className="h-4 w-4" />
                      Search
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="browse" className="mt-0">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                    <Select
                      value={selectedBook}
                      onValueChange={(book) => {
                        jumpToChapter(book, 1);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select book" />
                      </SelectTrigger>
                      <SelectContent>
                        {BIBLE_BOOKS.map((book) => (
                          <SelectItem key={book.name} value={book.name}>
                            {book.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={String(selectedChapter)}
                      onValueChange={(chapter) => {
                        const nextChapter = Number.parseInt(chapter, 10);
                        jumpToChapter(selectedBook, nextChapter);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chapter" />
                      </SelectTrigger>
                      <SelectContent>
                        {chapterOptions.map((chapter) => (
                          <SelectItem key={chapter} value={String(chapter)}>
                            Chapter {chapter}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border/80 bg-muted/30">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-2xl">{activeReference}</CardTitle>
                  <CardDescription className="mt-1">
                    {translation}
                    {passage?.source ? ` • Source: ${passage.source}` : ""}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => jumpToChapter(selectedBook, selectedChapter - 1)}
                    disabled={!canGoPrevious}
                    className="gap-2"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => jumpToChapter(selectedBook, selectedChapter + 1)}
                    disabled={!canGoNext}
                    className="gap-2"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  {savedMatch ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => removeSavedPassage.mutate(savedMatch.id)}
                      disabled={removeSavedPassage.isPending}
                      className="gap-2"
                    >
                      <Bookmark className="h-4 w-4" />
                      Saved
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => passage && savePassage.mutate({ passage })}
                      disabled={!passage || savePassage.isPending}
                      className="gap-2"
                    >
                      <Bookmark className="h-4 w-4" />
                      Save Passage
                    </Button>
                  )}
                  {isAdmin ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleShareToFeed}
                      disabled={!passage}
                      className="gap-2"
                    >
                      <Share2 className="h-4 w-4" />
                      Share To Feed
                    </Button>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 p-6">
              {isLoading ? (
                <div className="space-y-3">
                  <div className="h-5 w-40 animate-pulse rounded bg-muted" />
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  <div className="h-4 w-11/12 animate-pulse rounded bg-muted" />
                </div>
              ) : error ? (
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                  <p className="font-medium text-destructive">Could not load that passage.</p>
                  <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
                </div>
              ) : passage ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{passage.translation}</Badge>
                    {passage.book ? <Badge variant="secondary">{passage.book}</Badge> : null}
                    {passage.chapter ? <Badge variant="secondary">Chapter {passage.chapter}</Badge> : null}
                  </div>

                  {passage.verses && passage.verses.length > 0 ? (
                    <div className="space-y-3">
                      {passage.verses.map((verse) => (
                        <p key={`${verse.chapter}-${verse.verse}`} className="text-[15px] leading-8 text-foreground">
                          <span className="mr-2 align-top text-xs font-semibold uppercase tracking-[0.12em] text-sky-700">
                            {verse.verse}
                          </span>
                          <span>{verse.text.trim()}</span>
                        </p>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl bg-muted/30 p-5">
                      <p className="whitespace-pre-wrap text-[15px] leading-8 text-foreground">{passage.text}</p>
                    </div>
                  )}
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <PassageSidebarSection title="Saved Passages" icon={Bookmark} emptyText="Save a passage to keep it here.">
            {savedPassages.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "w-full rounded-xl border px-3 py-3 text-left transition-colors hover:bg-muted/60",
                  passage?.id === item.passage_cache_id && "border-primary bg-primary/5"
                )}
                onClick={() => {
                  setTranslation(item.translation as BibleTranslation);
                  submitReference(item.reference);
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{item.reference}</p>
                  <Badge variant="outline">{item.translation}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Saved {new Date(item.created_at).toLocaleDateString()}
                </p>
              </button>
            ))}
          </PassageSidebarSection>

          <PassageSidebarSection title="Recent Passages" icon={Clock3} emptyText="Your reading history will appear here.">
            {recentPassages.map((item) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  "w-full rounded-xl border px-3 py-3 text-left transition-colors hover:bg-muted/60",
                  passage?.id === item.passage_cache_id && "border-primary bg-primary/5"
                )}
                onClick={() => {
                  setTranslation(item.translation as BibleTranslation);
                  submitReference(item.reference);
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{item.reference}</p>
                  <Badge variant="outline">{item.translation}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Viewed {new Date(item.viewed_at).toLocaleString()}
                </p>
              </button>
            ))}
          </PassageSidebarSection>
        </div>
      </div>
    </div>
  );
}
