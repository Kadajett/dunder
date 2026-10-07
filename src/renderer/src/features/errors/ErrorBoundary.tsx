import "./errors.css";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportError } from "./errors-store";

interface Props {
	/** What this boundary guards, as Jeremy would name it: 'whiteboard', 'office view'. */
	readonly region: string;
	readonly children: ReactNode;
}

interface State {
	readonly error: Error | null;
}

/**
 * Keeps one region's crash from blanking the window: the region shows a small
 * notice with the error and a Retry, and main hears about it (Trust Inbox).
 * React needs a class for this.
 */
export class ErrorBoundary extends Component<Props, State> {
	override state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	override componentDidCatch(error: Error, info: ErrorInfo): void {
		const stack = [error.stack, info.componentStack].filter(Boolean).join("\n");
		reportError(
			Object.assign(new Error(error.message), { name: error.name, stack }),
			`boundary:${this.props.region}`,
		);
	}

	override render(): ReactNode {
		const { error } = this.state;
		if (!error) return this.props.children;
		return (
			<div className="error-notice" role="alert">
				<strong>The {this.props.region} hit an error</strong>
				<code>{error.message || error.name}</code>
				<button type="button" onClick={() => this.setState({ error: null })}>
					Retry
				</button>
			</div>
		);
	}
}
