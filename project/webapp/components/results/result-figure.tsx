export function ResultFigure({
  src,
  alt,
  caption,
}: Readonly<{ src: string; alt: string; caption?: string }>) {
  return (
    <figure className="space-y-2">
      <div className="overflow-hidden rounded-lg border bg-card p-2">
        {/*
          Plain <img>, not next/image: served from our own allowlisted route
          (app/api/results/image), not a remote/user-supplied URL, and each
          matplotlib figure's dimensions aren't known upfront - w-full/h-auto
          is simpler and more honest than forcing a fixed aspect ratio.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="mx-auto h-auto w-full max-w-2xl" loading="lazy" />
      </div>
      {caption ? <figcaption className="text-sm text-muted-foreground">{caption}</figcaption> : null}
    </figure>
  );
}
