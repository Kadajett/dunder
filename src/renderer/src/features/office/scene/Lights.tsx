/** Warm sky/ground fill plus one soft shadow-casting sun through the windows. */
export function Lights() {
	return (
		<>
			<hemisphereLight args={["#fff6e6", "#b8956a", 1.25]} />
			<ambientLight intensity={0.22} color="#ffe9cc" />
			<directionalLight
				position={[16, 26, 12]}
				intensity={1.9}
				color="#fff1dc"
				castShadow
				shadow-mapSize={[2048, 2048]}
				shadow-camera-left={-24}
				shadow-camera-right={24}
				shadow-camera-top={24}
				shadow-camera-bottom={-24}
				shadow-camera-near={1}
				shadow-camera-far={80}
				shadow-bias={-0.0005}
				shadow-normalBias={0.02}
			/>
		</>
	);
}
