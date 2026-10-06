import { Canvas } from "@react-three/fiber";
import type { AvatarStyle } from "@shared/avatar/style";
import { MiiCharacter } from "../office/characters/MiiCharacter";

/** A small standing, idling Mii in the new hire's look. */
export function MiiPreview({ style }: { readonly style: AvatarStyle }) {
	return (
		<div className="hire-preview">
			<Canvas
				dpr={[1, 2]}
				camera={{ position: [0, 1.05, 2.6], fov: 32 }}
				onCreated={({ camera }) => camera.lookAt(0, 0.78, 0)}
			>
				<hemisphereLight args={["#fff6e6", "#b8956a", 1.4]} />
				<directionalLight position={[2, 4, 3]} intensity={1.6} color="#fff1dc" />
				<group rotation={[0, -0.35, 0]}>
					<MiiCharacter style={style} pose="standing" activity="idle" />
				</group>
			</Canvas>
		</div>
	);
}
