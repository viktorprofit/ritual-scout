// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ReportRegistry {

    uint256 public reportCount;

    struct Report {
        uint256 id;
        address author;
        string project;
        uint256 score;
        string model;
        string reportHash;
        string ipfsCid;
        uint256 createdAt;
    }

    mapping(uint256 => Report) public reports;

    mapping(address => uint256[]) public reportsByUser;

    event ReportSaved(
        uint256 indexed id,
        address indexed author,
        string project,
        uint256 score
    );

    function saveReport(
        string calldata project,
        uint256 score,
        string calldata model,
        string calldata reportHash,
        string calldata ipfsCid
    ) external {

        reportCount++;

        reports[reportCount] = Report({
            id: reportCount,
            author: msg.sender,
            project: project,
            score: score,
            model: model,
            reportHash: reportHash,
            ipfsCid: ipfsCid,
            createdAt: block.timestamp
        });

        reportsByUser[msg.sender].push(reportCount);

        emit ReportSaved(
            reportCount,
            msg.sender,
            project,
            score
        );
    }

    function getUserReports(
        address user
    ) external view returns (uint256[] memory) {

        return reportsByUser[user];
    }

    function getReport(
        uint256 id
    ) external view returns (Report memory) {

        return reports[id];
    }

}