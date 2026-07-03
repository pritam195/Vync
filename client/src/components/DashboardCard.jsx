function DashboardCard({ label, value, detail, icon: Icon }) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card/90 p-5 shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-ring/30 hover:shadow-md sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold text-muted-foreground">{label}</p>
        {Icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-surface text-muted-foreground shadow-xs transition-colors group-hover:text-primary">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      <p className="mt-6 text-3xl font-semibold tracking-normal text-foreground">{value}</p>
      <p className="mt-2 text-xs font-medium text-muted-foreground">{detail}</p>
      <div className="pointer-events-none absolute inset-x-4 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
    </article>
  );
}

export default DashboardCard;
