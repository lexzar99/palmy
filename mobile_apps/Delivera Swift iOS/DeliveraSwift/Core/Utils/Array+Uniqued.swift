import Foundation

extension Array where Element == Restaurant {
    func sortedForHome() -> [Restaurant] {
        sorted {
            let leftClass = $0.featuredClass ?? 99
            let rightClass = $1.featuredClass ?? 99
            if leftClass != rightClass { return leftClass < rightClass }
            return ($0.rating ?? 0) > ($1.rating ?? 0)
        }
    }

    func uniqued() -> [Restaurant] {
        var seen = Set<String>()
        return filter { seen.insert($0.id).inserted }
    }
}
