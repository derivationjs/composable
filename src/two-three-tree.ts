export interface Monoid<S> {
  empty: S;
  combine: (a: S, b: S) => S;
}

type Leaf<K, V, S> = {
  type: "leaf";
  id: K;
  value: V;
  parent: Branch<K, V, S> | null;
};

type Branch2<K, V, S> = {
  type: "branch2";
  child1: Node<K, V, S>;
  child2: Node<K, V, S>;
  summary1: S;
  summary2: S;
  depth: number;
  parent: Branch<K, V, S> | null;
};

type Branch3<K, V, S> = {
  type: "branch3";
  child1: Node<K, V, S>;
  child2: Node<K, V, S>;
  child3: Node<K, V, S>;
  summary1: S;
  summary2: S;
  summary3: S;
  depth: number;
  parent: Branch<K, V, S> | null;
};

type Branch<K, V, S> = Branch2<K, V, S> | Branch3<K, V, S>;
type Node<K, V, S> = Leaf<K, V, S> | Branch<K, V, S>;

function getDepth<K, V, S>(node: Node<K, V, S>): number {
  switch (node.type) {
    case "leaf":
      return 0;
    case "branch2":
    case "branch3":
      return node.depth;
  }
}

export class TwoThreeTree<K, V, S> {
  private root: Node<K, V, S> | null = null;
  private index: Map<K, Leaf<K, V, S>> = new Map();
  private monoid: Monoid<S>;
  private measure: (value: V) => S;

  constructor(monoid: Monoid<S>, measure: (value: V) => S) {
    this.monoid = monoid;
    this.measure = measure;
  }

  private getSummary(node: Node<K, V, S>): S {
    switch (node.type) {
      case "leaf":
        return this.measure(node.value);
      case "branch2":
        return node.summary2;
      case "branch3":
        return node.summary3;
    }
  }

  get summary(): S {
    return this.root ? this.getSummary(this.root) : this.monoid.empty;
  }

  /**
   * Find the first leaf where threshold(accumulated) returns true.
   * accumulated is the combined summary of all leaves up to and including the candidate.
   */
  findByThreshold(
    threshold: (accumulated: S) => boolean,
  ): { id: K; value: V } | undefined {
    if (this.root === null) return undefined;
    return this.findInNode(this.root, this.monoid.empty, threshold);
  }

  private findInNode(
    node: Node<K, V, S>,
    prefix: S,
    threshold: (accumulated: S) => boolean,
  ): { id: K; value: V } | undefined {
    switch (node.type) {
      case "leaf": {
        const accumulated = this.monoid.combine(
          prefix,
          this.measure(node.value),
        );
        if (threshold(accumulated)) {
          return { id: node.id, value: node.value };
        }
        return undefined;
      }
      case "branch2": {
        const acc1 = this.monoid.combine(prefix, node.summary1);
        if (threshold(acc1)) {
          return this.findInNode(node.child1, prefix, threshold);
        }
        const acc2 = this.monoid.combine(prefix, node.summary2);
        if (threshold(acc2)) {
          return this.findInNode(node.child2, acc1, threshold);
        }
        return undefined;
      }
      case "branch3": {
        const acc1 = this.monoid.combine(prefix, node.summary1);
        if (threshold(acc1)) {
          return this.findInNode(node.child1, prefix, threshold);
        }
        const acc2 = this.monoid.combine(prefix, node.summary2);
        if (threshold(acc2)) {
          return this.findInNode(node.child2, acc1, threshold);
        }
        const acc3 = this.monoid.combine(prefix, node.summary3);
        if (threshold(acc3)) {
          return this.findInNode(node.child3, acc2, threshold);
        }
        return undefined;
      }
    }
  }

  /**
   * Insert at the position where threshold(prefix) first returns true.
   * prefix is the combined summary of all leaves before the insertion point.
   * If threshold never returns true, inserts at the end.
   */
  insert(id: K, value: V, threshold: (prefix: S) => boolean): void {
    const newLeaf: Leaf<K, V, S> = {
      type: "leaf",
      id,
      value,
      parent: null,
    };

    this.index.set(id, newLeaf);

    if (this.root === null) {
      this.root = newLeaf;
      return;
    }

    switch (this.root.type) {
      case "leaf": {
        const oldLeaf = this.root;
        if (threshold(this.monoid.empty)) {
          this.root = this.makeBranch2(newLeaf, oldLeaf, 1, null);
        } else {
          this.root = this.makeBranch2(oldLeaf, newLeaf, 1, null);
        }
        this.checkInvariants();
        return;
      }
      case "branch2":
      case "branch3":
        break;
    }

    const overflow = this.insertIntoSubtree(
      this.root,
      this.monoid.empty,
      threshold,
      newLeaf,
    );
    if (overflow) {
      const [left, right] = overflow;
      this.root = this.makeBranch2(left, right, getDepth(left) + 1, null);
    }
    this.checkInvariants();
  }

  private insertIntoSubtree(
    branch: Branch<K, V, S>,
    prefix: S,
    threshold: (prefix: S) => boolean,
    newLeaf: Leaf<K, V, S>,
  ): [Node<K, V, S>, Node<K, V, S>] | null {
    let childIndex: number;
    let child: Node<K, V, S>;
    let childPrefix: S;

    if (branch.type === "branch2") {
      const acc1 = this.monoid.combine(prefix, branch.summary1);
      if (threshold(acc1)) {
        childIndex = 0;
        child = branch.child1;
        childPrefix = prefix;
      } else {
        childIndex = 1;
        child = branch.child2;
        childPrefix = acc1;
      }
    } else {
      const acc1 = this.monoid.combine(prefix, branch.summary1);
      const acc2 = this.monoid.combine(prefix, branch.summary2);
      if (threshold(acc1)) {
        childIndex = 0;
        child = branch.child1;
        childPrefix = prefix;
      } else if (threshold(acc2)) {
        childIndex = 1;
        child = branch.child2;
        childPrefix = acc1;
      } else {
        childIndex = 2;
        child = branch.child3;
        childPrefix = acc2;
      }
    }

    switch (child.type) {
      case "leaf": {
        const insertBefore = threshold(childPrefix);

        if (branch.type === "branch2") {
          if (childIndex === 0) {
            if (insertBefore) {
              const branch3 = this.makeBranch3(
                newLeaf,
                branch.child1,
                branch.child2,
                branch.depth,
                branch.parent,
              );
              this.replaceBranchInParent(branch, branch3);
            } else {
              const branch3 = this.makeBranch3(
                branch.child1,
                newLeaf,
                branch.child2,
                branch.depth,
                branch.parent,
              );
              this.replaceBranchInParent(branch, branch3);
            }
          } else {
            if (insertBefore) {
              const branch3 = this.makeBranch3(
                branch.child1,
                newLeaf,
                branch.child2,
                branch.depth,
                branch.parent,
              );
              this.replaceBranchInParent(branch, branch3);
            } else {
              const branch3 = this.makeBranch3(
                branch.child1,
                branch.child2,
                newLeaf,
                branch.depth,
                branch.parent,
              );
              this.replaceBranchInParent(branch, branch3);
            }
          }
          return null;
        } else {
          let c1: Node<K, V, S>,
            c2: Node<K, V, S>,
            c3: Node<K, V, S>,
            c4: Node<K, V, S>;
          if (childIndex === 0) {
            if (insertBefore) {
              c1 = newLeaf;
              c2 = branch.child1;
              c3 = branch.child2;
              c4 = branch.child3;
            } else {
              c1 = branch.child1;
              c2 = newLeaf;
              c3 = branch.child2;
              c4 = branch.child3;
            }
          } else if (childIndex === 1) {
            if (insertBefore) {
              c1 = branch.child1;
              c2 = newLeaf;
              c3 = branch.child2;
              c4 = branch.child3;
            } else {
              c1 = branch.child1;
              c2 = branch.child2;
              c3 = newLeaf;
              c4 = branch.child3;
            }
          } else {
            if (insertBefore) {
              c1 = branch.child1;
              c2 = branch.child2;
              c3 = newLeaf;
              c4 = branch.child3;
            } else {
              c1 = branch.child1;
              c2 = branch.child2;
              c3 = branch.child3;
              c4 = newLeaf;
            }
          }
          const left = this.makeBranch2(c1, c2, branch.depth, branch.parent);
          const right = this.makeBranch2(c3, c4, branch.depth, branch.parent);
          return [left, right];
        }
      }
      case "branch2":
      case "branch3": {
        const overflow = this.insertIntoSubtree(
          child,
          childPrefix,
          threshold,
          newLeaf,
        );

        if (overflow === null) {
          this.updateBranchStats(branch);
          return null;
        }

        const [overflowLeft, overflowRight] = overflow;
        if (branch.type === "branch2") {
          if (childIndex === 0) {
            const branch3 = this.makeBranch3(
              overflowLeft,
              overflowRight,
              branch.child2,
              branch.depth,
              branch.parent,
            );
            this.replaceBranchInParent(branch, branch3);
          } else {
            const branch3 = this.makeBranch3(
              branch.child1,
              overflowLeft,
              overflowRight,
              branch.depth,
              branch.parent,
            );
            this.replaceBranchInParent(branch, branch3);
          }
          return null;
        } else {
          let c1: Node<K, V, S>,
            c2: Node<K, V, S>,
            c3: Node<K, V, S>,
            c4: Node<K, V, S>;
          if (childIndex === 0) {
            c1 = overflowLeft;
            c2 = overflowRight;
            c3 = branch.child2;
            c4 = branch.child3;
          } else if (childIndex === 1) {
            c1 = branch.child1;
            c2 = overflowLeft;
            c3 = overflowRight;
            c4 = branch.child3;
          } else {
            c1 = branch.child1;
            c2 = branch.child2;
            c3 = overflowLeft;
            c4 = overflowRight;
          }
          const left = this.makeBranch2(c1, c2, branch.depth, branch.parent);
          const right = this.makeBranch2(c3, c4, branch.depth, branch.parent);
          return [left, right];
        }
      }
    }
  }

  private makeBranch2(
    child1: Node<K, V, S>,
    child2: Node<K, V, S>,
    depth: number,
    parent: Branch<K, V, S> | null,
  ): Branch2<K, V, S> {
    const s1 = this.getSummary(child1);
    const s2 = this.getSummary(child2);
    const branch: Branch2<K, V, S> = {
      type: "branch2",
      child1,
      child2,
      summary1: s1,
      summary2: this.monoid.combine(s1, s2),
      depth,
      parent,
    };
    child1.parent = branch;
    child2.parent = branch;
    return branch;
  }

  private makeBranch3(
    child1: Node<K, V, S>,
    child2: Node<K, V, S>,
    child3: Node<K, V, S>,
    depth: number,
    parent: Branch<K, V, S> | null,
  ): Branch3<K, V, S> {
    const s1 = this.getSummary(child1);
    const s2 = this.getSummary(child2);
    const s3 = this.getSummary(child3);
    const combined = this.monoid.combine(s1, s2);
    const branch: Branch3<K, V, S> = {
      type: "branch3",
      child1,
      child2,
      child3,
      summary1: s1,
      summary2: combined,
      summary3: this.monoid.combine(combined, s3),
      depth,
      parent,
    };
    child1.parent = branch;
    child2.parent = branch;
    child3.parent = branch;
    return branch;
  }

  private replaceBranchInParent(
    oldBranch: Branch<K, V, S>,
    newBranch: Branch<K, V, S>,
  ): void {
    const parent = oldBranch.parent;
    if (parent === null) {
      this.root = newBranch;
      return;
    }

    if (parent.child1 === oldBranch) {
      parent.child1 = newBranch;
    } else if (parent.child2 === oldBranch) {
      parent.child2 = newBranch;
    } else if (parent.type === "branch3" && parent.child3 === oldBranch) {
      parent.child3 = newBranch;
    }
    newBranch.parent = parent;
    this.updateBranchStats(parent);
  }

  private updateBranchStats(branch: Branch<K, V, S>): void {
    switch (branch.type) {
      case "branch2": {
        const s1 = this.getSummary(branch.child1);
        const s2 = this.getSummary(branch.child2);
        branch.summary1 = s1;
        branch.summary2 = this.monoid.combine(s1, s2);
        break;
      }
      case "branch3": {
        const s1 = this.getSummary(branch.child1);
        const s2 = this.getSummary(branch.child2);
        const s3 = this.getSummary(branch.child3);
        branch.summary1 = s1;
        branch.summary2 = this.monoid.combine(s1, s2);
        branch.summary3 = this.monoid.combine(branch.summary2, s3);
        break;
      }
    }
  }

  remove(id: K): void {
    const leaf = this.index.get(id);
    if (!leaf) return;

    this.index.delete(id);

    if (this.root === leaf) {
      this.root = null;
      return;
    }

    const parent = leaf.parent!;
    this.removeFromParent(parent, leaf);
    this.checkInvariants();
  }

  private removeFromParent(
    branch: Branch<K, V, S>,
    child: Node<K, V, S>,
  ): void {
    let remaining: Node<K, V, S>[];
    let childIndex: number;

    if (branch.type === "branch2") {
      if (branch.child1 === child) {
        childIndex = 0;
        remaining = [branch.child2];
      } else {
        childIndex = 1;
        remaining = [branch.child1];
      }
    } else {
      if (branch.child1 === child) {
        childIndex = 0;
        remaining = [branch.child2, branch.child3];
      } else if (branch.child2 === child) {
        childIndex = 1;
        remaining = [branch.child1, branch.child3];
      } else {
        childIndex = 2;
        remaining = [branch.child1, branch.child2];
      }
    }

    if (remaining.length === 2) {
      const newBranch = this.makeBranch2(
        remaining[0],
        remaining[1],
        branch.depth,
        branch.parent,
      );
      this.replaceBranchInParent(branch, newBranch);
      this.propagateStatsUp(newBranch.parent);
      return;
    }

    const remainingChild = remaining[0];
    const parent = branch.parent;

    if (parent === null) {
      remainingChild.parent = null;
      this.root = remainingChild;
      return;
    }

    let branchIndex: number;
    if (parent.child1 === branch) {
      branchIndex = 0;
    } else if (parent.child2 === branch) {
      branchIndex = 1;
    } else {
      branchIndex = 2;
    }

    const numSiblings = parent.type === "branch2" ? 2 : 3;

    if (branchIndex > 0) {
      const leftSibling = branchIndex === 1 ? parent.child1 : parent.child2;
      if (leftSibling.type === "branch3") {
        const borrowed = leftSibling.child3;
        const newLeftSibling = this.makeBranch2(
          leftSibling.child1,
          leftSibling.child2,
          leftSibling.depth,
          parent,
        );
        const newBranch = this.makeBranch2(
          borrowed,
          remainingChild,
          branch.depth,
          parent,
        );

        if (branchIndex === 1) {
          parent.child1 = newLeftSibling;
          parent.child2 = newBranch;
        } else {
          parent.child2 = newLeftSibling;
          (parent as Branch3<K, V, S>).child3 = newBranch;
        }
        this.updateBranchStats(parent);
        this.propagateStatsUp(parent.parent);
        return;
      }
    }

    if (branchIndex < numSiblings - 1) {
      const rightSibling =
        branchIndex === 0 ? parent.child2 : (parent as Branch3<K, V, S>).child3;
      if (rightSibling.type === "branch3") {
        const borrowed = rightSibling.child1;
        const newRightSibling = this.makeBranch2(
          rightSibling.child2,
          rightSibling.child3,
          rightSibling.depth,
          parent,
        );
        const newBranch = this.makeBranch2(
          remainingChild,
          borrowed,
          branch.depth,
          parent,
        );

        if (branchIndex === 0) {
          parent.child1 = newBranch;
          parent.child2 = newRightSibling;
        } else {
          parent.child2 = newBranch;
          (parent as Branch3<K, V, S>).child3 = newRightSibling;
        }
        this.updateBranchStats(parent);
        this.propagateStatsUp(parent.parent);
        return;
      }
    }

    if (branchIndex > 0) {
      const leftSibling = branchIndex === 1 ? parent.child1 : parent.child2;
      if (leftSibling.type === "branch2") {
        const newMerged = this.makeBranch3(
          leftSibling.child1,
          leftSibling.child2,
          remainingChild,
          leftSibling.depth,
          parent,
        );

        if (branchIndex === 1) {
          parent.child1 = newMerged;
        } else {
          parent.child2 = newMerged;
        }
        this.removeFromParent(parent, branch);
        return;
      }
    }

    if (branchIndex < numSiblings - 1) {
      const rightSibling =
        branchIndex === 0 ? parent.child2 : (parent as Branch3<K, V, S>).child3;
      if (rightSibling.type === "branch2") {
        const newMerged = this.makeBranch3(
          remainingChild,
          rightSibling.child1,
          rightSibling.child2,
          rightSibling.depth,
          parent,
        );

        if (branchIndex === 0) {
          parent.child2 = newMerged;
        } else {
          (parent as Branch3<K, V, S>).child3 = newMerged;
        }
        this.removeFromParent(parent, branch);
        return;
      }
    }

    throw new Error(
      "Invariant violation: could not borrow from or merge with any sibling during removal",
    );
  }

  private propagateStatsUp(branch: Branch<K, V, S> | null): void {
    while (branch !== null) {
      this.updateBranchStats(branch);
      branch = branch.parent;
    }
  }

  /**
   * Get the prefix summary for a given id (sum of all elements before it).
   */
  getPrefixSummaryById(id: K): S | undefined {
    const leaf = this.index.get(id);
    if (!leaf) return undefined;

    let summary = this.monoid.empty;
    let current: Node<K, V, S> = leaf;
    let parent = leaf.parent;

    while (parent !== null) {
      // summary1 is prefix sum through child1, summary2 is prefix sum through child2
      if (parent.child2 === current) {
        // child2: add summary1 (prefix sum of child1)
        summary = this.monoid.combine(parent.summary1, summary);
      } else if (parent.type === "branch3" && parent.child3 === current) {
        // child3: add summary2 (prefix sum of child1 + child2)
        summary = this.monoid.combine(parent.summary2, summary);
      }
      // child1: add nothing (no preceding siblings)
      current = parent;
      parent = parent.parent;
    }

    return summary;
  }

  *[Symbol.iterator](): Iterator<{ id: K; value: V }> {
    if (this.root === null) return;
    yield* this.iterateNode(this.root);
  }

  private *iterateNode(node: Node<K, V, S>): Generator<{ id: K; value: V }> {
    switch (node.type) {
      case "leaf":
        yield { id: node.id, value: node.value };
        break;
      case "branch2":
        yield* this.iterateNode(node.child1);
        yield* this.iterateNode(node.child2);
        break;
      case "branch3":
        yield* this.iterateNode(node.child1);
        yield* this.iterateNode(node.child2);
        yield* this.iterateNode(node.child3);
        break;
    }
  }

  checkInvariants(): void {
    if (this.root === null) return;
    this.checkNodeInvariants(this.root);
  }

  private checkNodeInvariants(node: Node<K, V, S>): void {
    switch (node.type) {
      case "leaf":
        return;
      case "branch2": {
        const depth1 = getDepth(node.child1);
        const depth2 = getDepth(node.child2);

        if (depth1 !== depth2) {
          throw new Error(
            `Invariant violation: children have different depths. ` +
              `Child 1 has depth ${depth1}, child 2 has depth ${depth2}`,
          );
        }

        if (node.depth !== depth1 + 1) {
          throw new Error(
            `Invariant violation: branch depth (${node.depth}) != child depth (${depth1}) + 1`,
          );
        }

        this.checkNodeInvariants(node.child1);
        this.checkNodeInvariants(node.child2);
        break;
      }
      case "branch3": {
        const depth1 = getDepth(node.child1);
        const depth2 = getDepth(node.child2);
        const depth3 = getDepth(node.child3);

        if (depth1 !== depth2 || depth2 !== depth3) {
          throw new Error(
            `Invariant violation: children have different depths. ` +
              `Depths: ${depth1}, ${depth2}, ${depth3}`,
          );
        }

        if (node.depth !== depth1 + 1) {
          throw new Error(
            `Invariant violation: branch depth (${node.depth}) != child depth (${depth1}) + 1`,
          );
        }

        this.checkNodeInvariants(node.child1);
        this.checkNodeInvariants(node.child2);
        this.checkNodeInvariants(node.child3);
        break;
      }
    }
  }
}
