import type { HTMLAttributes, ReactNode } from 'react';

export function Card({ className = '', children, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={`print-card rounded-[1.25rem] border border-line bg-surface p-5 shadow-[var(--shadow-card)] sm:p-6 ${className}`}
      {...rest}
    >
      {children}
    </section>
  );
}

interface CardHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  id?: string;
}

export function CardHeader({ title, subtitle, action, icon, id }: CardHeaderProps) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-[1_1_15rem] items-start gap-3">
        {icon && <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-sage-soft text-sage-deep">{icon}</span>}
        <div className="min-w-0">
          <h2 id={id} className="font-serif text-lg font-medium leading-tight text-ink sm:text-xl">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-[13px] leading-snug text-muted">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="max-w-full shrink-0">{action}</div>}
    </header>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-serif text-3xl font-medium leading-tight text-ink sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
