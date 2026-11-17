"use client";

import { useMutation } from "@tanstack/react-query";
import { Globe, HardDrive, ImagePlus, Info, Link2, LoaderCircle, Search, TriangleAlert, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import type { PhotoOwner } from "@/lib/drafts";
import { formatBytes, OK_TYPES } from "@/lib/photos/shared";
import { findPicture, useAddLinkPhoto, usePhotoStorage, useUploadPhoto, type FoundPicture } from "@/lib/queries/images";
import { cn } from "@/lib/utils";
import { PhotoImg } from "./photo-img";

type Tab = "link" | "upload";

/**
 * Add a photo to an idea: paste a link (we find the page's picture and keep its address) or upload a file (shrunk on the
 * phone first). Owner only. Every refusal says what happened and what to try next.
 */
export function AddPhotoSheet({
  idea,
  onClose,
}: {
  idea: PhotoOwner;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("link");
  const storage = usePhotoStorage();
  const full = !!storage.data && storage.data.cap > 0 && storage.data.used >= storage.data.cap;

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add a photo"
      description={`For “${idea.name}”`}
      footer={
        tab === "link" ? undefined : (
          <Button variant="outline" size="lg" className="w-full" onClick={onClose}>
            Cancel
          </Button>
        )
      }
    >
      <div className="space-y-4 pt-1">
        <Segmented<Tab>
          label="How to add a photo"
          value={tab}
          onChange={setTab}
          className="flex w-full"
          options={[
            { value: "link", label: "Paste link" },
            { value: "upload", label: "Upload" },
          ]}
        />
        {tab === "link" ? (
          <LinkTab idea={idea} onClose={onClose} onUpload={() => setTab("upload")} />
        ) : (
          <UploadTab idea={idea} onClose={onClose} full={full} onLink={() => setTab("link")} />
        )}
      </div>
    </Sheet>
  );
}

function LinkTab({
  idea,
  onClose,
  onUpload,
}: {
  idea: Omit<PhotoOwner, "name">;
  onClose: () => void;
  onUpload: () => void;
}) {
  const [url, setUrl] = useState("");
  const [credit, setCredit] = useState("");
  const add = useAddLinkPhoto();
  const find = useMutation<FoundPicture, Error, string>({
    mutationFn: findPicture,
    onSuccess: (f) => setCredit(f.site),
  });
  const found = find.data;
  const submitLink = () => url.trim().length >= 8 && !find.isPending && find.mutate(url.trim());

  return (
    <>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submitLink();
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">Page or picture link</span>
          <Input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (find.data || find.error) find.reset();
            }}
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="https://…"
            className="text-[15px]"
          />
        </label>
        <Button
          type="submit"
          variant="secondary"
          className="shrink-0"
          disabled={url.trim().length < 8 || find.isPending}
        >
          <Search className="size-[18px]" strokeWidth={2.6} aria-hidden />
          Find photo
        </Button>
      </form>

      {find.isPending && (
        <div aria-live="polite" className="space-y-3">
          <p className="flex items-center gap-2.5 font-bold">
            <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden />
            Checking the page…
          </p>
          <div className="aspect-video animate-pulse rounded-2xl bg-surface-2 motion-reduce:animate-none" aria-hidden />
        </div>
      )}

      {find.isError && (
        <div className="space-y-3">
          <div role="alert" className="flex gap-3 rounded-2xl bg-danger-tint p-4">
            <TriangleAlert className="mt-0.5 size-[22px] shrink-0 text-danger" strokeWidth={2.2} aria-hidden />
            <div>
              <h3 className="font-display text-[17px] font-extrabold tracking-tight">
                Couldn’t get a picture from that link
              </h3>
              <p className="mt-1 text-sm text-fg-muted">{find.error.message}</p>
              <ul className="mt-2 list-disc space-y-0.5 pl-[18px] text-sm text-fg-muted">
                <li>The link has to start with https://</li>
                <li>Private and internal addresses are never opened</li>
                <li>The page needs a picture, under 10 MB</li>
              </ul>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="flex-1" onClick={() => (find.reset(), setUrl(""))}>
              <Link2 className="size-[18px]" aria-hidden />
              Try another link
            </Button>
            <Button variant="secondary" className="flex-1" onClick={onUpload}>
              <Upload className="size-[18px]" aria-hidden />
              Upload a file
            </Button>
          </div>
        </div>
      )}

      {found && (
        <div className="space-y-3.5">
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-surface-2">
            <PhotoImg src={found.imageUrl} alt="Picture found on the page" className="size-full" />
            <span className="absolute bottom-2 left-2 inline-flex min-h-[26px] items-center gap-1.5 rounded-full bg-[var(--attrib-bg)] px-2.5 text-xs font-bold text-[var(--attrib-ink)]">
              <Globe className="size-3.5" strokeWidth={2.4} aria-hidden />
              {found.site}
            </span>
          </div>
          <p className="font-bold text-teal">Found a picture on {found.site}</p>
          <Field label="Credit (optional)" hint="Shown under the photo.">
            {(p) => <Input {...p} value={credit} maxLength={200} onChange={(e) => setCredit(e.target.value)} />}
          </Field>
          <p className="flex items-start gap-2 text-[13px] text-fg-muted">
            <Info className="mt-0.5 size-4 shrink-0" strokeWidth={2.4} aria-hidden />
            We keep the link to the picture, not a copy. If the site removes it, the card shows a placeholder instead.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" size="lg" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="lg"
              className="flex-1"
              disabled={add.isPending}
              onClick={() => add.mutate({ idea: idea, found, credit }, { onSuccess: onClose })}
            >
              Add photo
            </Button>
          </div>
        </div>
      )}
      {!found && !find.isPending && !find.isError && (
        <div className="flex gap-3 rounded-2xl bg-surface-2 p-3.5 text-[13px] text-fg-muted">
          <Info className="mt-0.5 size-4 shrink-0" strokeWidth={2.4} aria-hidden />
          Paste a page from a hotel, restaurant or sight, or the address of a picture. Only https links work.
        </div>
      )}
    </>
  );
}

function UploadTab({
  idea,
  onClose,
  full,
  onLink,
}: {
  idea: Omit<PhotoOwner, "name">;
  onClose: () => void;
  full: boolean;
  onLink: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const storage = usePhotoStorage();
  const upload = useUploadPhoto();
  const [stage, setStage] = useState<"resizing" | "uploading" | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const busy = upload.isPending;
  const used = storage.data?.used ?? 0;
  const cap = storage.data?.cap ?? 0;
  // The cap is 90% of the plan's 1 GB; the meter shows the plan's whole allowance so the number matches the dashboard.
  const total = 1024 ** 3;

  const choose = (f: File | undefined) => {
    if (!f || full) return;
    setFile(f);
    upload.mutate({ idea: idea, file: f, onStage: setStage }, { onSuccess: onClose, onSettled: () => setStage(null) });
  };

  return (
    <>
      {full && (
        <div role="status" className="flex gap-3 rounded-2xl bg-surface-2 p-4 ring-[1.5px] ring-line-strong">
          <HardDrive className="mt-0.5 size-[22px] shrink-0 text-warn-text" strokeWidth={2.2} aria-hidden />
          <div>
            <h3 className="font-display text-[17px] font-extrabold tracking-tight">Photo storage is almost full</h3>
            <p className="mt-1 text-sm text-fg-muted">
              Your project has used {formatBytes(used)} of its 1 GB of file storage. Remove a photo you don’t need, or
              add pictures by link, which use no storage.
            </p>
          </div>
        </div>
      )}
      {file && busy ? (
        <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3" aria-live="polite">
          <span className="grid size-[72px] shrink-0 place-items-center rounded-xl bg-surface text-fg-muted">
            <ImagePlus className="size-7" strokeWidth={1.8} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{file.name}</p>
            <p className="text-[13px] text-fg-muted">{stage === "resizing" ? "Shrinking to 1280 px…" : "Uploading…"}</p>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-line"
              role="progressbar"
              aria-label="Uploading"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={stage === "uploading" ? 70 : 30}
            >
              <i
                className={cn(
                  "block h-full rounded-full bg-teal transition-[width] motion-reduce:transition-none",
                  stage === "uploading" ? "w-[70%]" : "w-[30%]",
                )}
              />
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={full}
          onClick={() => input.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-[18px] border-2 border-dashed border-line-strong px-4 py-6 text-center text-fg-muted disabled:opacity-50"
        >
          <ImagePlus className="size-[30px]" strokeWidth={1.8} aria-hidden />
          <b className="text-base text-fg">Choose a photo</b>
          <span className="text-sm">JPEG, PNG or WebP</span>
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept={OK_TYPES.join(",")}
        hidden
        aria-hidden
        onChange={(e) => {
          choose(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {!full && !busy && (
        <p className="flex items-start gap-2 text-[13px] text-fg-muted">
          <Info className="mt-0.5 size-4 shrink-0" strokeWidth={2.4} aria-hidden />
          Photos are shrunk on your phone before they upload, so they load fast and use little storage.
        </p>
      )}
      {storage.data && (
        <div className="space-y-1.5" role="img" aria-label={`Photo storage: ${formatBytes(used)} of 1 GB used`}>
          <div className="flex justify-between text-[13px] text-fg-muted">
            <span>Photo storage</span>
            <b className="font-mono text-fg tabular-nums">{formatBytes(used)} of 1 GB</b>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <i
              className={cn("block h-full rounded-full", used >= cap ? "bg-danger" : "bg-chart-4")}
              style={{ width: `${Math.max(2, Math.min(100, (used / total) * 100))}%` }}
            />
          </div>
        </div>
      )}
      {full && (
        <Button variant="outline" className="w-full" onClick={onLink}>
          <Link2 className="size-[18px]" aria-hidden />
          Use a link instead
        </Button>
      )}
    </>
  );
}
