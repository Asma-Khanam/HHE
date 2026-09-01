import { useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IconCheckCircle } from "./icons";
import "./FamilyTree.css";

// Renders the exact diagram the CEO hand-drew for this flow: Mother <-> Father,
// with both connected down to Child 1, Child 2, etc. Node positions are
// measured (not hand-placed), so it lays out correctly for 1 child or 6.
export default function FamilyTree({ mother, father, accountHolderRole, childList, missingCountFor }) {
  const navigate = useNavigate();
  // Same navigation pattern as WhatsLeftCard — jump to the Application tab
  // with the stepKey of whoever was clicked, opening their card directly.
  function goToPerson(stepKey) {
    navigate("/app/form", { state: { stepKey } });
  }
  const containerRef = useRef(null);
  const motherRef = useRef(null);
  const fatherRef = useRef(null);
  const childRefs = useRef([]);
  const [geometry, setGeometry] = useState(null);

  useLayoutEffect(() => {
    function measure() {
      const container = containerRef.current;
      if (!container) return;
      const containerBox = container.getBoundingClientRect();
      const boxFor = (el) => {
        const box = el.getBoundingClientRect();
        return {
          left: box.left - containerBox.left,
          right: box.right - containerBox.left,
          top: box.top - containerBox.top,
          bottom: box.bottom - containerBox.top,
          centerX: box.left + box.width / 2 - containerBox.left,
          centerY: box.top + box.height / 2 - containerBox.top,
        };
      };
      const topPointFor = (el) => {
        const box = boxFor(el);
        return { x: box.centerX, y: box.top };
      };

      const motherBox = motherRef.current && boxFor(motherRef.current);
      const fatherBox = fatherRef.current && boxFor(fatherRef.current);
      const childPoints = childRefs.current.filter(Boolean).map((el) => topPointFor(el));

      setGeometry({ motherBox, fatherBox, childPoints, height: containerBox.height, width: containerBox.width });
    }

    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [childList.length]);

  const motherMissing = missingCountFor("mother");
  const fatherMissing = missingCountFor("father");

  return (
    <div className="family-tree-card">
      <h3>Family</h3>
      <div className="family-tree" ref={containerRef}>
        {geometry && (
          <svg className="family-tree-svg" width={geometry.width} height={geometry.height}>
            <defs>
              <marker id="tree-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" className="family-tree-arrowhead" />
              </marker>
            </defs>

            {/* Mother <-> Father, double-headed, exactly as drawn — anchored
                to the facing edges of the two ovals (the gap between them),
                never through the ovals themselves, so the arrowheads aren't
                hidden behind an opaque node. */}
            {geometry.motherBox && geometry.fatherBox && (
              <line
                x1={geometry.motherBox.right}
                y1={geometry.motherBox.centerY}
                x2={geometry.fatherBox.left}
                y2={geometry.fatherBox.centerY}
                className="family-tree-line"
                markerStart="url(#tree-arrow)"
                markerEnd="url(#tree-arrow)"
              />
            )}

            {/* Midpoint between the parents, straight down to a bus line, then
                one arrow per child — same shape as the sketch's fan-out. */}
            {geometry.motherBox && geometry.fatherBox && geometry.childPoints.length > 0 && (
              <>
                {(() => {
                  const midX = (geometry.motherBox.centerX + geometry.fatherBox.centerX) / 2;
                  const parentBottom = Math.max(geometry.motherBox.bottom, geometry.fatherBox.bottom);
                  const busY = parentBottom + 22;
                  const childXs = geometry.childPoints.map((p) => p.x);
                  const busLeft = Math.min(midX, ...childXs);
                  const busRight = Math.max(midX, ...childXs);
                  return (
                    <>
                      <line x1={midX} y1={parentBottom} x2={midX} y2={busY} className="family-tree-line" />
                      <line x1={busLeft} y1={busY} x2={busRight} y2={busY} className="family-tree-line" />
                      {geometry.childPoints.map((p, i) => (
                        <line
                          key={i}
                          x1={p.x}
                          y1={busY}
                          x2={p.x}
                          y2={p.y - 6}
                          className="family-tree-line"
                          markerEnd="url(#tree-arrow)"
                        />
                      ))}
                    </>
                  );
                })()}
              </>
            )}
          </svg>
        )}

        <div className="family-tree-parents">
          <TreeNode
            nodeRef={motherRef}
            title="Mother"
            name={mother?.full_name}
            isHolder={accountHolderRole === "Mother"}
            missingCount={motherMissing}
            onClick={() => goToPerson("mother")}
          />
          <TreeNode
            nodeRef={fatherRef}
            title="Father"
            name={father?.full_name}
            isHolder={accountHolderRole === "Father"}
            missingCount={fatherMissing}
            onClick={() => goToPerson("father")}
          />
        </div>

        <div className="family-tree-children">
          {childList.map((child, i) => (
            <TreeNode
              key={child.id || i}
              nodeRef={(el) => (childRefs.current[i] = el)}
              title={childList.length > 1 ? `Child ${i + 1}` : "Child"}
              name={child.full_name}
              small
              missingCount={missingCountFor("child", i)}
              onClick={() => goToPerson(`child-${i}`)}
            />
          ))}
          {childList.length === 0 && <p className="family-tree-empty-note">No children added yet.</p>}
        </div>
      </div>
    </div>
  );
}

function TreeNode({ nodeRef, title, name, isHolder, small, missingCount, onClick }) {
  const ready = missingCount === 0;
  return (
    <button
      type="button"
      className={"family-tree-node" + (small ? " family-tree-node-small" : "")}
      ref={nodeRef}
      onClick={onClick}
    >
      <span className="family-tree-node-title">
        {title}
        {isHolder && <span className="family-tree-holder-badge">Account holder</span>}
      </span>
      <span className="family-tree-node-name">{name || "Not started"}</span>
      {ready ? (
        <span className="family-tree-node-status is-ready">
          <IconCheckCircle size={12} /> Ready
        </span>
      ) : (
        <span className="family-tree-node-status">
          {missingCount} item{missingCount === 1 ? "" : "s"} left
        </span>
      )}
    </button>
  );
}
