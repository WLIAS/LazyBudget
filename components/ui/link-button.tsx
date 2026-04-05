// Utility: a Next.js Link that looks like a Button (base-ui doesn't support asChild)
import Link from 'next/link';
import { buttonVariants } from './button';
import { cn } from '@/lib/utils';
import type { VariantProps } from 'class-variance-authority';

type Props = React.ComponentProps<typeof Link> &
  VariantProps<typeof buttonVariants> & { className?: string };

export function LinkButton({ variant, size, className, ...props }: Props) {
  return (
    <Link
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
